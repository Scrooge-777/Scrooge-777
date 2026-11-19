package com.certverify.flows

import co.paralleluniverse.fibers.Suspendable
import com.certverify.contracts.CertificateContract
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowException
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.ReceiveFinalityFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder

/**
 * Run by the ISSUING UNIVERSITY to revoke a certificate.
 *
 * The ISSUED state is consumed and replaced by a REVOKED state with the same linearId. The notary
 * guarantees the ISSUED version can never be used again, and the full history stays on the ledger
 * as an audit trail.
 */
@InitiatingFlow
@StartableByRPC
class RevokeCertificateFlow(
    private val certificateId: String,
    private val reason: String
) : FlowLogic<SignedTransaction>() {

    @Suspendable
    override fun call(): SignedTransaction {
        val id = certificateId.trim()
        if (reason.isBlank()) throw FlowException("A revocation reason must be given.")

        val current = CertificateQueries.findLatest(serviceHub, id)
            ?: throw FlowException("No certificate with ID $id was found.")
        val certificate = current.state.data

        if (certificate.university != ourIdentity) {
            throw FlowException("Only the issuing university (${certificate.university.name}) can revoke certificate $id.")
        }
        if (!certificate.isValid) throw FlowException("Certificate $id is already revoked.")

        val builder = TransactionBuilder(current.state.notary)
            .addInputState(current)
            .addOutputState(certificate.revoke(reason.trim()), CertificateContract.ID)
            .addCommand(CertificateContract.Commands.Revoke(), ourIdentity.owningKey)

        builder.verify(serviceHub)
        val signedTx = serviceHub.signInitialTransaction(builder)

        val studentSession = initiateFlow(certificate.student)
        return subFlow(FinalityFlow(signedTx, listOf(studentSession)))
    }
}

/** Run by the STUDENT node: records the revocation so the student's copy is always up to date. */
@InitiatedBy(RevokeCertificateFlow::class)
class RevokeCertificateResponder(private val universitySession: FlowSession) : FlowLogic<SignedTransaction>() {
    @Suspendable
    override fun call(): SignedTransaction = subFlow(ReceiveFinalityFlow(universitySession))
}
