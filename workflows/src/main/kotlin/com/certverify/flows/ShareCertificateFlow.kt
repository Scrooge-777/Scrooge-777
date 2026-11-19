package com.certverify.flows

import co.paralleluniverse.fibers.Suspendable
import net.corda.core.flows.FlowException
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.ReceiveTransactionFlow
import net.corda.core.flows.SendTransactionFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.node.StatesToRecord

/**
 * Run by the STUDENT to give a verifier (e.g. an employer) a copy of a certificate.
 *
 * The verifier receives the signed transaction *and its full back-chain*, re-runs the contract on
 * every transaction and checks the university's and notary's signatures before storing it. The
 * verifier therefore trusts the maths, not the student — a student cannot fabricate a certificate.
 *
 * Sharing is the student's choice: nobody else can see the certificate unless it is shared with them.
 */
@InitiatingFlow
@StartableByRPC
class ShareCertificateFlow(
    private val certificateId: String,
    private val verifier: Party
) : FlowLogic<String>() {

    @Suspendable
    override fun call(): String {
        val id = certificateId.trim()
        val current = CertificateQueries.findLatest(serviceHub, id)
            ?: throw FlowException("No certificate with ID $id was found.")
        val certificate = current.state.data

        if (ourIdentity != certificate.student && ourIdentity != certificate.university) {
            throw FlowException("Only the student or the issuing university may share certificate $id.")
        }
        if (verifier == ourIdentity) throw FlowException("Cannot share a certificate with yourself.")

        val tx = serviceHub.validatedTransactions.getTransaction(current.ref.txhash)
            ?: throw FlowException("Transaction ${current.ref.txhash} for certificate $id is missing from storage.")

        val session = initiateFlow(verifier)
        subFlow(SendTransactionFlow(session, tx))
        return "Certificate $id shared with ${verifier.name.organisation}."
    }
}

/**
 * Run by the VERIFIER: checks the whole chain of custody and stores the certificate even though the
 * verifier is not a participant (StatesToRecord.ALL_VISIBLE).
 */
@InitiatedBy(ShareCertificateFlow::class)
class ShareCertificateResponder(private val studentSession: FlowSession) : FlowLogic<Unit>() {
    @Suspendable
    override fun call() {
        subFlow(
            ReceiveTransactionFlow(
                studentSession,
                checkSufficientSignatures = true,
                statesToRecord = StatesToRecord.ALL_VISIBLE
            )
        )
    }
}
