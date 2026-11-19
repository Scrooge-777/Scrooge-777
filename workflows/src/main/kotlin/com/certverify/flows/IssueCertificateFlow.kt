package com.certverify.flows

import co.paralleluniverse.fibers.Suspendable
import com.certverify.contracts.CertificateContract
import com.certverify.states.CertificateState
import net.corda.core.flows.FinalityFlow
import net.corda.core.flows.FlowException
import net.corda.core.flows.FlowLogic
import net.corda.core.flows.FlowSession
import net.corda.core.flows.InitiatedBy
import net.corda.core.flows.InitiatingFlow
import net.corda.core.flows.ReceiveFinalityFlow
import net.corda.core.flows.StartableByRPC
import net.corda.core.identity.Party
import net.corda.core.transactions.SignedTransaction
import net.corda.core.transactions.TransactionBuilder
import net.corda.core.utilities.ProgressTracker
import java.time.LocalDate

/**
 * Run by a UNIVERSITY node to issue a certificate to a student.
 *
 * Steps: check the certificate number is unused -> build the transaction -> run the contract ->
 * sign with the university's key -> record in both the university's and the student's vault.
 * The transaction has no inputs, so FinalityFlow does not need to notarise it.
 *
 * @param documentHash SHA-256 (hex) of the certificate PDF. The PDF itself never goes on the ledger.
 */
@InitiatingFlow
@StartableByRPC
class IssueCertificateFlow(
    private val certificateId: String,
    private val studentName: String,
    private val rollNumber: String,
    private val program: String,
    private val specialization: String,
    private val cgpa: Double,
    private val yearOfPassing: Int,
    private val documentHash: String,
    private val student: Party
) : FlowLogic<SignedTransaction>() {

    companion object {
        object CHECKING : ProgressTracker.Step("Checking the certificate number is not already in use.")
        object BUILDING : ProgressTracker.Step("Building the issuance transaction.")
        object VERIFYING : ProgressTracker.Step("Verifying the transaction against the certificate contract.")
        object SIGNING : ProgressTracker.Step("Signing with the university's key.")
        object FINALISING : ProgressTracker.Step("Recording in the student's vault.") {
            override fun childProgressTracker() = FinalityFlow.tracker()
        }

        fun tracker() = ProgressTracker(CHECKING, BUILDING, VERIFYING, SIGNING, FINALISING)
    }

    override val progressTracker = tracker()

    @Suspendable
    override fun call(): SignedTransaction {
        progressTracker.currentStep = CHECKING
        val id = certificateId.trim()
        if (id.isEmpty()) throw FlowException("Certificate ID must not be blank.")
        if (student == ourIdentity) throw FlowException("A university cannot issue a certificate to itself.")
        if (CertificateQueries.exists(serviceHub, id)) {
            throw FlowException("Certificate $id has already been issued. Certificate numbers must be unique.")
        }

        progressTracker.currentStep = BUILDING
        val notary = serviceHub.networkMapCache.notaryIdentities.firstOrNull()
            ?: throw FlowException("No notary found on the network.")

        val certificate = CertificateState(
            certificateId = id,
            studentName = studentName.trim(),
            rollNumber = rollNumber.trim(),
            program = program.trim(),
            specialization = specialization.trim(),
            cgpa = cgpa,
            yearOfPassing = yearOfPassing,
            issueDate = LocalDate.now(serviceHub.clock),
            documentHash = documentHash.trim().lowercase(),
            university = ourIdentity,
            student = student
        )

        val builder = TransactionBuilder(notary)
            .addOutputState(certificate, CertificateContract.ID)
            .addCommand(CertificateContract.Commands.Issue(), ourIdentity.owningKey)

        progressTracker.currentStep = VERIFYING
        builder.verify(serviceHub)

        progressTracker.currentStep = SIGNING
        val signedTx = serviceHub.signInitialTransaction(builder)

        progressTracker.currentStep = FINALISING
        val studentSession = initiateFlow(student)
        return subFlow(FinalityFlow(signedTx, listOf(studentSession), FINALISING.childProgressTracker()))
    }
}

/** Run by the STUDENT node: verifies and records the newly issued certificate. */
@InitiatedBy(IssueCertificateFlow::class)
class IssueCertificateResponder(private val universitySession: FlowSession) : FlowLogic<SignedTransaction>() {
    @Suspendable
    override fun call(): SignedTransaction = subFlow(ReceiveFinalityFlow(universitySession))
}
