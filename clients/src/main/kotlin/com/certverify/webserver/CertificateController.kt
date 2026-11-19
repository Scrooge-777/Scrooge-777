package com.certverify.webserver

import com.certverify.flows.IssueCertificateFlow
import com.certverify.flows.RevokeCertificateFlow
import com.certverify.flows.ShareCertificateFlow
import com.certverify.flows.VerificationResult
import com.certverify.flows.VerifyCertificateFlow
import com.certverify.states.CertificateState
import net.corda.core.identity.CordaX500Name
import net.corda.core.identity.Party
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.messaging.vaultQueryBy
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.PageSpecification
import net.corda.core.node.services.vault.QueryCriteria
import net.corda.core.transactions.SignedTransaction
import net.corda.core.utilities.getOrThrow
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Duration

/**
 * REST API for one node. The same code serves the university, student and employer portals; what
 * each can actually do is enforced by the flows and the contract, not by the web layer.
 *
 *   GET  /api/me                          this node's identity
 *   GET  /api/peers                       other parties on the network (for drop-downs)
 *   GET  /api/certificates                certificates in this node's vault
 *   GET  /api/certificates/{id}/history   full audit trail of one certificate
 *   POST /api/certificates                issue a certificate        (university)
 *   POST /api/certificates/{id}/revoke    revoke a certificate       (issuing university)
 *   POST /api/certificates/{id}/share     share with a verifier      (student)
 *   POST /api/verify                      ask the issuer to verify   (any verifier)
 */
@RestController
@RequestMapping("/api")
class CertificateController(private val rpc: NodeRPCConnection) {

    companion object {
        private val logger = LoggerFactory.getLogger(CertificateController::class.java)
        private val FLOW_TIMEOUT: Duration = Duration.ofSeconds(60)
        private val PAGE = PageSpecification(pageNumber = 1, pageSize = 500)
    }

    private val proxy: CordaRPCOps get() = rpc.proxy
    private val me: Party by lazy { proxy.nodeInfo().legalIdentities.first() }

    @GetMapping("/me")
    fun me(): Map<String, String> = mapOf(
        "name" to me.name.toString(),
        "organisation" to me.name.organisation,
        "locality" to me.name.locality
    )

    @GetMapping("/peers")
    fun peers(): List<Map<String, String>> {
        val notaries = proxy.notaryIdentities().toSet()
        return proxy.networkMapSnapshot()
            .flatMap { it.legalIdentities }
            .filter { it != me && it !in notaries }
            .distinct()
            .map { mapOf("name" to it.name.toString(), "organisation" to it.name.organisation) }
            .sortedBy { it["organisation"] }
    }

    @GetMapping("/certificates")
    fun certificates(): List<CertificateDto> {
        val criteria = QueryCriteria.VaultQueryCriteria(status = Vault.StateStatus.UNCONSUMED)
        val page = proxy.vaultQueryBy<CertificateState>(criteria, PAGE)
        return page.states.zip(page.statesMetadata).map { (sar, meta) ->
            val cert = sar.state.data
            CertificateDto.from(cert, relationshipOf(cert), sar.ref.txhash.toString(), meta.recordedTime.toString())
        }.sortedByDescending { it.recordedAt }
    }

    @GetMapping("/certificates/{id}/history")
    fun history(@PathVariable id: String): List<CertificateDto> {
        val criteria = QueryCriteria.LinearStateQueryCriteria(externalId = listOf(id), status = Vault.StateStatus.ALL)
        val page = proxy.vaultQueryBy<CertificateState>(criteria, PAGE)
        return page.states.zip(page.statesMetadata).map { (sar, meta) ->
            val cert = sar.state.data
            CertificateDto.from(cert, relationshipOf(cert), sar.ref.txhash.toString(), meta.recordedTime.toString())
        }.sortedBy { it.recordedAt }
    }

    @PostMapping("/certificates")
    fun issue(@RequestBody req: IssueRequest): ResponseEntity<ApiMessage> {
        val student = resolveParty(req.student)
        val stx = proxy.startFlowDynamic(
            IssueCertificateFlow::class.java,
            req.certificateId, req.studentName, req.rollNumber, req.program, req.specialization,
            req.cgpa, req.yearOfPassing, req.documentHash, student
        ).returnValue.getOrThrow(FLOW_TIMEOUT)
        return created("Certificate ${req.certificateId} issued to ${student.name.organisation}.", stx)
    }

    @PostMapping("/certificates/{id}/revoke")
    fun revoke(@PathVariable id: String, @RequestBody req: RevokeRequest): ResponseEntity<ApiMessage> {
        val stx = proxy.startFlowDynamic(RevokeCertificateFlow::class.java, id, req.reason)
            .returnValue.getOrThrow(FLOW_TIMEOUT)
        return created("Certificate $id revoked.", stx)
    }

    @PostMapping("/certificates/{id}/share")
    fun share(@PathVariable id: String, @RequestBody req: ShareRequest): ApiMessage {
        val verifier = resolveParty(req.verifier)
        val message = proxy.startFlowDynamic(ShareCertificateFlow::class.java, id, verifier)
            .returnValue.getOrThrow(FLOW_TIMEOUT)
        return ApiMessage(message)
    }

    @PostMapping("/verify")
    fun verify(@RequestBody req: VerifyRequest): VerificationDto {
        val university = resolveParty(req.university)
        val result: VerificationResult = proxy.startFlowDynamic(
            VerifyCertificateFlow::class.java, req.certificateId, university, req.documentHash ?: ""
        ).returnValue.getOrThrow(FLOW_TIMEOUT)
        return VerificationDto.from(result)
    }

    @ExceptionHandler(Exception::class)
    fun handle(e: Exception): ResponseEntity<ApiMessage> {
        logger.warn("Request failed", e)
        val message = e.message?.substringAfterLast("Exception: ")?.ifBlank { null } ?: e.javaClass.simpleName
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiMessage(message))
    }

    private fun relationshipOf(cert: CertificateState): String = when (me) {
        cert.university -> "ISSUED_BY_ME"
        cert.student -> "HELD_BY_ME"
        else -> "SHARED_WITH_ME"
    }

    /** Accepts a full X.500 name ("O=StudentWallet,L=Bengaluru,C=IN") or part of an organisation name. */
    private fun resolveParty(name: String): Party {
        val trimmed = name.trim()
        if (trimmed.contains("O=")) {
            return proxy.wellKnownPartyFromX500Name(CordaX500Name.parse(trimmed))
                ?: throw IllegalArgumentException("Unknown party: $trimmed")
        }
        val matches = proxy.partiesFromName(trimmed, false)
        return matches.singleOrNull()
            ?: throw IllegalArgumentException(
                if (matches.isEmpty()) "Unknown party: $trimmed" else "Ambiguous party name: $trimmed"
            )
    }

    private fun created(message: String, stx: SignedTransaction) =
        ResponseEntity.status(HttpStatus.CREATED).body(ApiMessage(message, stx.id.toString()))
}
