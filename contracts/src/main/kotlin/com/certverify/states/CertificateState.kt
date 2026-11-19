package com.certverify.states

import com.certverify.contracts.CertificateContract
import net.corda.core.contracts.BelongsToContract
import net.corda.core.contracts.LinearState
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.identity.AbstractParty
import net.corda.core.identity.Party
import net.corda.core.serialization.CordaSerializable
import java.time.LocalDate

/** Lifecycle of an academic certificate on the ledger. */
@CordaSerializable
enum class CertificateStatus { ISSUED, REVOKED }

/**
 * An academic certificate (degree / diploma / transcript summary) recorded on the Corda ledger.
 *
 * Only the *fingerprint* of the certificate document (a SHA-256 hash of the PDF) is stored on the
 * ledger, never the document itself. Anyone holding the PDF can recompute the hash and compare it
 * with the ledger record, which proves the document has not been altered since it was issued.
 *
 * The state is a [LinearState]: its [linearId] stays the same across its whole life (ISSUED -> REVOKED),
 * and the human-readable [certificateId] is stored as the linearId's externalId so the vault can be
 * queried by certificate number.
 *
 * Participants are the issuing [university] and the [student]. Verifiers (employers, other universities)
 * are NOT participants: they only see a certificate if the student shares it, or by asking the
 * university directly — this keeps student records private by default.
 */
@BelongsToContract(CertificateContract::class)
data class CertificateState(
    val certificateId: String,
    val studentName: String,
    val rollNumber: String,
    val program: String,
    val specialization: String,
    val cgpa: Double,
    val yearOfPassing: Int,
    val issueDate: LocalDate,
    val documentHash: String,
    val university: Party,
    val student: Party,
    val status: CertificateStatus = CertificateStatus.ISSUED,
    val revocationReason: String? = null,
    override val linearId: UniqueIdentifier = UniqueIdentifier(externalId = certificateId)
) : LinearState {

    override val participants: List<AbstractParty> get() = listOf(university, student)

    val isValid: Boolean get() = status == CertificateStatus.ISSUED

    /** Returns a copy of this certificate marked as revoked. */
    fun revoke(reason: String): CertificateState =
        copy(status = CertificateStatus.REVOKED, revocationReason = reason)
}
