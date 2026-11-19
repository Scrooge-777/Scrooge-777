package com.certverify.flows

import com.certverify.states.CertificateState
import com.certverify.states.CertificateStatus
import net.corda.core.flows.FlowException
import net.corda.core.identity.CordaX500Name
import net.corda.core.identity.Party
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.getOrThrow
import net.corda.testing.node.MockNetwork
import net.corda.testing.node.MockNetworkNotarySpec
import net.corda.testing.node.MockNetworkParameters
import net.corda.testing.node.StartedMockNode
import net.corda.testing.node.TestCordapp
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CertificateFlowTests {
    private lateinit var network: MockNetwork
    private lateinit var university: StartedMockNode
    private lateinit var student: StartedMockNode
    private lateinit var employer: StartedMockNode
    private lateinit var otherUniversity: StartedMockNode

    private val hash = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
    private val tamperedHash = "a".repeat(64)

    @Before
    fun setup() {
        network = MockNetwork(
            MockNetworkParameters(
                cordappsForAllNodes = listOf(
                    TestCordapp.findCordapp("com.certverify.contracts"),
                    TestCordapp.findCordapp("com.certverify.flows")
                ),
                notarySpecs = listOf(MockNetworkNotarySpec(CordaX500Name("Notary", "Mumbai", "IN")))
            )
        )
        university = network.createPartyNode(CordaX500Name("Vidya University", "Bengaluru", "IN"))
        student = network.createPartyNode(CordaX500Name("StudentWallet", "Bengaluru", "IN"))
        employer = network.createPartyNode(CordaX500Name("TechCorp Employer", "Hyderabad", "IN"))
        otherUniversity = network.createPartyNode(CordaX500Name("Shiksha University", "Chennai", "IN"))
        network.runNetwork()
    }

    @After
    fun tearDown() = network.stopNodes()

    // ---------------------------------------------------------------- helpers

    private val StartedMockNode.party: Party get() = info.legalIdentities.first()

    private fun issue(id: String = "VU-2026-CSE-0001", by: StartedMockNode = university): SignedTransaction {
        val future = by.startFlow(
            IssueCertificateFlow(
                id, "Asha Rao", "1VU22CS042", "B.Tech", "Computer Science and Engineering",
                8.74, 2026, hash, student.party
            )
        )
        network.runNetwork()
        return future.getOrThrow()
    }

    private fun revoke(id: String, by: StartedMockNode = university, reason: String = "Malpractice"): SignedTransaction {
        val future = by.startFlow(RevokeCertificateFlow(id, reason))
        network.runNetwork()
        return future.getOrThrow()
    }

    private fun share(id: String) {
        val future = student.startFlow(ShareCertificateFlow(id, employer.party))
        network.runNetwork()
        future.getOrThrow()
    }

    private fun verify(id: String, documentHash: String, issuer: StartedMockNode = university): VerificationResult {
        val future = employer.startFlow(VerifyCertificateFlow(id, issuer.party, documentHash))
        network.runNetwork()
        return future.getOrThrow()
    }

    private fun StartedMockNode.certificates(): List<CertificateState> =
        services.vaultService.queryBy(CertificateState::class.java).states.map { it.state.data }

    // ------------------------------------------------------------------ issue

    @Test
    fun `issued certificate is recorded by university and student only`() {
        val stx = issue()
        for (node in listOf(university, student)) {
            assertEquals(stx, node.services.validatedTransactions.getTransaction(stx.id))
            val cert = node.certificates().single()
            assertEquals("VU-2026-CSE-0001", cert.certificateId)
            assertEquals(CertificateStatus.ISSUED, cert.status)
        }
        assertTrue(employer.certificates().isEmpty(), "Employer must not see certificates that were not shared")
    }

    @Test
    fun `issued transaction is signed by the university`() {
        val stx = issue()
        stx.verifyRequiredSignatures()
        assertTrue(stx.sigs.any { it.by == university.party.owningKey })
    }

    @Test
    fun `certificate numbers must be unique`() {
        issue("DUP-1")
        assertFailsWith<FlowException> { issue("DUP-1") }
    }

    // ----------------------------------------------------------------- revoke

    @Test
    fun `university can revoke and student sees it`() {
        issue("REV-1")
        revoke("REV-1")
        for (node in listOf(university, student)) {
            val cert = node.certificates().single()
            assertEquals(CertificateStatus.REVOKED, cert.status)
            assertEquals("Malpractice", cert.revocationReason)
        }
        // Full history (ISSUED -> REVOKED) is kept.
        val all = university.services.vaultService.queryBy(
            CertificateState::class.java,
            QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.ALL)
        ).states
        assertEquals(2, all.size)
    }

    @Test
    fun `student cannot revoke`() {
        issue("REV-2")
        assertFailsWith<FlowException> { revoke("REV-2", by = student) }
    }

    @Test
    fun `cannot revoke twice`() {
        issue("REV-3")
        revoke("REV-3")
        assertFailsWith<FlowException> { revoke("REV-3") }
    }

    // ------------------------------------------------------------------ share

    @Test
    fun `shared certificate lands in the employer's vault after back-chain checks`() {
        issue("SH-1")
        share("SH-1")
        val cert = employer.certificates().single()
        assertEquals("SH-1", cert.certificateId)
        assertEquals(university.party, cert.university)
    }

    @Test
    fun `employer cannot re-share a certificate it does not own`() {
        issue("SH-2")
        share("SH-2")
        val future = employer.startFlow(ShareCertificateFlow("SH-2", otherUniversity.party))
        network.runNetwork()
        assertFailsWith<FlowException> { future.getOrThrow() }
    }

    // ----------------------------------------------------------------- verify

    @Test
    fun `genuine document verifies as valid with details`() {
        issue("VF-1")
        val result = verify("VF-1", hash)
        assertEquals(VerificationOutcome.VALID, result.outcome)
        assertTrue(result.detailsDisclosed)
        assertEquals("Asha Rao", result.studentName)
    }

    @Test
    fun `status check without document reveals no personal details`() {
        issue("VF-2")
        val result = verify("VF-2", "")
        assertEquals(VerificationOutcome.VALID, result.outcome)
        assertFalse(result.detailsDisclosed)
        assertNull(result.studentName)
    }

    @Test
    fun `tampered document is detected`() {
        issue("VF-3")
        val result = verify("VF-3", tamperedHash)
        assertEquals(VerificationOutcome.HASH_MISMATCH, result.outcome)
        assertNull(result.studentName)
    }

    @Test
    fun `revoked certificate is reported as revoked immediately`() {
        issue("VF-4")
        assertEquals(VerificationOutcome.VALID, verify("VF-4", hash).outcome)
        revoke("VF-4")
        val result = verify("VF-4", hash)
        assertEquals(VerificationOutcome.REVOKED, result.outcome)
        assertEquals("Malpractice", result.revocationReason)
    }

    @Test
    fun `unknown certificate is not found`() {
        assertEquals(VerificationOutcome.NOT_FOUND, verify("NOPE-1", hash).outcome)
    }

    @Test
    fun `asking the wrong university returns not found`() {
        issue("VF-5")
        assertEquals(VerificationOutcome.NOT_FOUND, verify("VF-5", hash, issuer = otherUniversity).outcome)
    }

    @Test
    fun `student node cannot vouch for its own certificate`() {
        issue("VF-6")
        // The student holds the state, but is not the issuer, so it must answer NOT_FOUND.
        assertEquals(VerificationOutcome.NOT_FOUND, verify("VF-6", hash, issuer = student).outcome)
    }
}
