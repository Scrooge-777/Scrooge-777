package com.certverify.flows

import co.paralleluniverse.fibers.Suspendable
import com.certverify.states.CertificateState
import com.certverify.states.CertificateStatus
import net.corda.core.flows.FlowException
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.serialization.CordaSerializable
import net.corda.core.utilities.unwrap
import java.time.Instant
import java.time.LocalDate

/** What the verifier sends to the university. An empty [documentHash] means "status check only". */
@CordaSerializable
data class VerificationRequest(val certificateId: String, val documentHash: String)

@CordaSerializable
enum class VerificationOutcome { VALID, REVOKED, HASH_MISMATCH, NOT_FOUND }

/**
 * The university's answer.
 *
 * Privacy rule: the student's personal details are only disclosed when the verifier proves it holds
 * the genuine certificate document (its SHA-256 hash matches the ledger). Knowing a certificate
 * number alone only reveals whether it is valid or revoked.
 */
@CordaSerializable
data class VerificationResult(
    val certificateId: String,
    val outcome: VerificationOutcome,
    val issuer: String,
    val message: String,
    val detailsDisclosed: Boolean,
    val studentName: String?,
    val rollNumber: String?,
    val program: String?,
    val specialization: String?,
    val cgpa: Double?,
    val yearOfPassing: Int?,
    val issueDate: LocalDate?,
    val revocationReason: String?,
    val ledgerTransactionId: String?,
    val checkedAt: Instant
)

/** Pure decision logic, kept separate from the flow so it can be unit-tested directly. */
object CertificateVerifier {

    fun evaluate(
        request: VerificationRequest,
        certificate: CertificateState?,
        issuer: Party,
        transactionId: String?,
        now: Instant
    ): VerificationResult {
        val id = request.certificateId
        val issuerName = issuer.name.organisation
        val suppliedHash = request.documentHash.trim().lowercase()

        fun result(
            outcome: VerificationOutcome,
            message: String,
            disclose: Boolean
        ) = VerificationResult(
            certificateId = id,
            outcome = outcome,
            issuer = issuerName,
            message = message,
            detailsDisclosed = disclose,
            studentName = if (disclose) certificate?.studentName else null,
            rollNumber = if (disclose) certificate?.rollNumber else null,
            program = if (disclose) certificate?.program else null,
            specialization = if (disclose) certificate?.specialization else null,
            cgpa = if (disclose) certificate?.cgpa else null,
            yearOfPassing = if (disclose) certificate?.yearOfPassing else null,
            issueDate = if (disclose) certificate?.issueDate else null,
            revocationReason = if (disclose) certificate?.revocationReason else null,
            ledgerTransactionId = if (certificate != null) transactionId else null,
            checkedAt = now
        )

        if (certificate == null || certificate.university != issuer) {
            return result(VerificationOutcome.NOT_FOUND, "$issuerName has no record of certificate $id.", false)
        }

        val hashSupplied = suppliedHash.isNotEmpty()
        val hashMatches = hashSupplied && suppliedHash == certificate.documentHash

        if (hashSupplied && !hashMatches) {
            return result(
                VerificationOutcome.HASH_MISMATCH,
                "The document does not match the certificate issued by $issuerName. It may have been altered.",
                false
            )
        }

        return when (certificate.status) {
            CertificateStatus.REVOKED -> result(
                VerificationOutcome.REVOKED,
                "Certificate $id was issued by $issuerName but has been REVOKED.",
                hashMatches
            )
            CertificateStatus.ISSUED -> result(
                VerificationOutcome.VALID,
                if (hashMatches) "Certificate $id is genuine and valid. The document matches the ledger record."
                else "Certificate $id is valid. Upload the certificate PDF to confirm the document and see its details.",
                hashMatches
            )
        }
    }
}

/**
 * Run by a VERIFIER (employer, admissions office, embassy...) to ask the issuing university, in real
 * time, whether a certificate is genuine and still valid. Because the answer comes from the issuer's
 * own vault, a revocation is reflected immediately.
 */
@InitiatingFlow
@StartableByRPC
class VerifyCertificateFlow(
    private val certificateId: String,
    private val university: Party,
    private val documentHash: String
) : FlowLogic<VerificationResult>() {

    @Suspendable
    override fun call(): VerificationResult {
        val id = certificateId.trim()
        if (id.isEmpty()) throw FlowException("Certificate ID must not be blank.")

        val session = initiateFlow(university)
        return session.sendAndReceive<VerificationResult>(VerificationRequest(id, documentHash.trim().lowercase()))
            .unwrap { answer ->
                if (answer.certificateId != id) {
                    throw FlowException("University answered for a different certificate (${answer.certificateId}).")
                }
                answer
            }
    }
}

/** Run by the UNIVERSITY: looks the certificate up in its own vault and answers the verifier. */
@InitiatedBy(VerifyCertificateFlow::class)
class VerifyCertificateResponder(private val verifierSession: FlowSession) : FlowLogic<Unit>() {

    @Suspendable
    override fun call() {
        val request = verifierSession.receive<VerificationRequest>().unwrap { req ->
            if (req.certificateId.isBlank()) throw FlowException("Certificate ID must not be blank.")
            if (req.certificateId.length > 64) throw FlowException("Certificate ID is too long.")
            req
        }

        val stateAndRef = CertificateQueries.findLatest(serviceHub, request.certificateId)
        val result = CertificateVerifier.evaluate(
            request = request,
            certificate = stateAndRef?.state?.data,
            issuer = ourIdentity,
            transactionId = stateAndRef?.ref?.txhash?.toString(),
            now = serviceHub.clock.instant()
        )
        verifierSession.send(result)
    }
}
