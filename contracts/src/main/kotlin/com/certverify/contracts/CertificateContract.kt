package com.certverify.contracts

import com.certverify.states.CertificateState
import com.certverify.states.CertificateStatus
import net.corda.core.contracts.CommandData
import net.corda.core.contracts.Contract
import net.corda.core.contracts.TypeOnlyCommandData
import net.corda.core.contracts.requireSingleCommand
import net.corda.core.contracts.requireThat
import net.corda.core.transactions.LedgerTransaction
import java.security.PublicKey

/**
 * The rules every certificate transaction must satisfy. Every node that receives a transaction
 * (university, student, verifier) runs this code independently, so a forged or malformed
 * certificate can never enter anyone's vault.
 */
class CertificateContract : Contract {

    companion object {
        const val ID = "com.certverify.contracts.CertificateContract"

        /** SHA-256 in lowercase hex: exactly 64 characters. */
        private val SHA256_HEX = Regex("^[0-9a-f]{64}$")

        const val MIN_CGPA = 0.0
        const val MAX_CGPA = 10.0
        const val MIN_YEAR = 1950
        const val MAX_YEAR = 2100
    }

    interface Commands : CommandData {
        /** A university issues a new certificate to a student. */
        class Issue : TypeOnlyCommandData(), Commands

        /** The issuing university revokes a certificate (fraud, error, disciplinary action...). */
        class Revoke : TypeOnlyCommandData(), Commands
    }

    override fun verify(tx: LedgerTransaction) {
        val command = tx.commands.requireSingleCommand<Commands>()
        when (command.value) {
            is Commands.Issue -> verifyIssue(tx, command.signers)
            is Commands.Revoke -> verifyRevoke(tx, command.signers)
            else -> throw IllegalArgumentException("Unrecognised command: ${command.value}")
        }
    }

    private fun verifyIssue(tx: LedgerTransaction, signers: List<PublicKey>) = requireThat {
        "No certificate may be consumed when issuing" using tx.inputsOfType<CertificateState>().isEmpty()
        "Exactly one certificate must be issued" using (tx.outputsOfType<CertificateState>().size == 1)

        val cert = tx.outputsOfType<CertificateState>().single()
        "A newly issued certificate must have status ISSUED" using (cert.status == CertificateStatus.ISSUED)
        "A newly issued certificate must not carry a revocation reason" using (cert.revocationReason == null)

        checkCertificateData(cert)

        "The issuing university must sign the transaction" using signers.contains(cert.university.owningKey)
    }

    private fun verifyRevoke(tx: LedgerTransaction, signers: List<PublicKey>) = requireThat {
        "Exactly one certificate must be consumed when revoking" using (tx.inputsOfType<CertificateState>().size == 1)
        "Exactly one certificate must be produced when revoking" using (tx.outputsOfType<CertificateState>().size == 1)

        val input = tx.inputsOfType<CertificateState>().single()
        val output = tx.outputsOfType<CertificateState>().single()

        "Only an ISSUED certificate can be revoked" using (input.status == CertificateStatus.ISSUED)
        "The output certificate must have status REVOKED" using (output.status == CertificateStatus.REVOKED)

        val reason = output.revocationReason
        "A revocation reason must be given" using (reason != null && reason.isNotBlank())

        "Revocation must not change any other certificate field" using
                (output == input.copy(status = CertificateStatus.REVOKED, revocationReason = reason))

        "The issuing university must sign the revocation" using signers.contains(input.university.owningKey)
    }

    /** Field-level validation shared by all commands that create certificate data. */
    private fun checkCertificateData(cert: CertificateState) = requireThat {
        "Certificate ID must not be blank" using cert.certificateId.isNotBlank()
        "Certificate ID must be the state's external ID" using (cert.linearId.externalId == cert.certificateId)
        "Student name must not be blank" using cert.studentName.isNotBlank()
        "Roll number must not be blank" using cert.rollNumber.isNotBlank()
        "Program must not be blank" using cert.program.isNotBlank()
        "Specialization must not be blank" using cert.specialization.isNotBlank()
        "CGPA must be between $MIN_CGPA and $MAX_CGPA" using (cert.cgpa in MIN_CGPA..MAX_CGPA)
        "Year of passing must be between $MIN_YEAR and $MAX_YEAR" using (cert.yearOfPassing in MIN_YEAR..MAX_YEAR)
        "Issue date must not be before the year of passing" using (cert.issueDate.year >= cert.yearOfPassing)
        "Document hash must be a lowercase hex SHA-256 digest" using SHA256_HEX.matches(cert.documentHash)
        "University and student must be different parties" using (cert.university != cert.student)
    }
}
