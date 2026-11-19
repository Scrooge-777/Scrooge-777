package com.certverify.contracts

import com.certverify.states.CertificateState
import com.certverify.states.CertificateStatus
import net.corda.core.contracts.UniqueIdentifier
import net.corda.core.identity.CordaX500Name
import net.corda.testing.core.TestIdentity
import net.corda.testing.node.MockServices
import net.corda.testing.node.ledger
import org.junit.Test
import java.time.LocalDate

class CertificateContractTests {
    private val university = TestIdentity(CordaX500Name("Vidya University", "Bengaluru", "IN"))
    private val student = TestIdentity(CordaX500Name("StudentWallet", "Bengaluru", "IN"))
    private val stranger = TestIdentity(CordaX500Name("Fake Institute", "Delhi", "IN"))
    private val ledgerServices = MockServices(listOf("com.certverify.contracts"))

    private val validHash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

    private fun certificate(
        id: String = "VU-2026-CSE-0001",
        cgpa: Double = 8.5,
        hash: String = validHash
    ) = CertificateState(
        certificateId = id,
        studentName = "Asha Rao",
        rollNumber = "1VU22CS042",
        program = "B.Tech",
        specialization = "Computer Science and Engineering",
        cgpa = cgpa,
        yearOfPassing = 2026,
        issueDate = LocalDate.of(2026, 7, 15),
        documentHash = hash,
        university = university.party,
        student = student.party
    )

    // ------------------------------------------------------------------ Issue

    @Test
    fun `valid issuance verifies`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate())
                command(university.publicKey, CertificateContract.Commands.Issue())
                verifies()
            }
        }
    }

    @Test
    fun `issuance must be signed by the university`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate())
                command(stranger.publicKey, CertificateContract.Commands.Issue())
                `fails with`("The issuing university must sign the transaction")
            }
        }
    }

    @Test
    fun `issuance must not consume a certificate`() {
        ledgerServices.ledger {
            transaction {
                input(CertificateContract.ID, certificate())
                output(CertificateContract.ID, certificate())
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("No certificate may be consumed when issuing")
            }
        }
    }

    @Test
    fun `only one certificate per issuance`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate("A-1"))
                output(CertificateContract.ID, certificate("A-2"))
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("Exactly one certificate must be issued")
            }
        }
    }

    @Test
    fun `cannot issue an already revoked certificate`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate().revoke("test"))
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("A newly issued certificate must have status ISSUED")
            }
        }
    }

    @Test
    fun `cgpa must be within 0 and 10`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate(cgpa = 10.5))
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("CGPA must be between")
            }
        }
    }

    @Test
    fun `document hash must be a SHA-256 hex digest`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate(hash = "not-a-hash"))
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("Document hash must be a lowercase hex SHA-256 digest")
            }
        }
    }

    @Test
    fun `certificate id must match the linear external id`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate().copy(linearId = UniqueIdentifier("OTHER-ID")))
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("Certificate ID must be the state's external ID")
            }
        }
    }

    @Test
    fun `university cannot issue to itself`() {
        ledgerServices.ledger {
            transaction {
                output(CertificateContract.ID, certificate().copy(student = university.party))
                command(university.publicKey, CertificateContract.Commands.Issue())
                `fails with`("University and student must be different parties")
            }
        }
    }

    // ----------------------------------------------------------------- Revoke

    @Test
    fun `valid revocation verifies`() {
        val issued = certificate()
        ledgerServices.ledger {
            transaction {
                input(CertificateContract.ID, issued)
                output(CertificateContract.ID, issued.revoke("Degree obtained through malpractice"))
                command(university.publicKey, CertificateContract.Commands.Revoke())
                verifies()
            }
        }
    }

    @Test
    fun `revocation must be signed by the issuing university`() {
        val issued = certificate()
        ledgerServices.ledger {
            transaction {
                input(CertificateContract.ID, issued)
                output(CertificateContract.ID, issued.revoke("reason"))
                command(student.publicKey, CertificateContract.Commands.Revoke())
                `fails with`("The issuing university must sign the revocation")
            }
        }
    }

    @Test
    fun `revocation needs a reason`() {
        val issued = certificate()
        ledgerServices.ledger {
            transaction {
                input(CertificateContract.ID, issued)
                output(CertificateContract.ID, issued.copy(status = CertificateStatus.REVOKED, revocationReason = " "))
                command(university.publicKey, CertificateContract.Commands.Revoke())
                `fails with`("A revocation reason must be given")
            }
        }
    }

    @Test
    fun `revocation cannot change grades`() {
        val issued = certificate()
        ledgerServices.ledger {
            transaction {
                input(CertificateContract.ID, issued)
                output(CertificateContract.ID, issued.revoke("reason").copy(cgpa = 9.9))
                command(university.publicKey, CertificateContract.Commands.Revoke())
                `fails with`("Revocation must not change any other certificate field")
            }
        }
    }

    @Test
    fun `cannot revoke an already revoked certificate`() {
        val revoked = certificate().revoke("first")
        ledgerServices.ledger {
            transaction {
                input(CertificateContract.ID, revoked)
                output(CertificateContract.ID, revoked.copy(revocationReason = "second"))
                command(university.publicKey, CertificateContract.Commands.Revoke())
                `fails with`("Only an ISSUED certificate can be revoked")
            }
        }
    }
}
