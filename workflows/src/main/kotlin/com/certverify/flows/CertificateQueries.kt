package com.certverify.flows

import com.certverify.states.CertificateState
import net.corda.core.contracts.StateAndRef
import net.corda.core.node.ServiceHub
import net.corda.core.node.services.Vault
import net.corda.core.node.services.vault.QueryCriteria

/**
 * Vault helpers shared by all certificate flows.
 *
 * The certificate number is stored as the LinearState's externalId, so it can be looked up with
 * a standard [QueryCriteria.LinearStateQueryCriteria] without a custom database schema.
 */
object CertificateQueries {

    /** Latest (unconsumed) version of a certificate, or null if this node has never seen it. */
    fun findLatest(services: ServiceHub, certificateId: String): StateAndRef<CertificateState>? {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            externalId = listOf(certificateId),
            status = Vault.StateStatus.UNCONSUMED
        )
        return services.vaultService.queryBy(CertificateState::class.java, criteria).states.firstOrNull()
    }

    /** True if any version (current or historic) of this certificate ID exists in the vault. */
    fun exists(services: ServiceHub, certificateId: String): Boolean {
        val criteria = QueryCriteria.LinearStateQueryCriteria(
            externalId = listOf(certificateId),
            status = Vault.StateStatus.ALL
        )
        return services.vaultService.queryBy(CertificateState::class.java, criteria).states.isNotEmpty()
    }
}
