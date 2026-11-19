package com.certverify.webserver

import jakarta.annotation.PostConstruct
import jakarta.annotation.PreDestroy
import net.corda.client.rpc.CordaRPCClient
import net.corda.client.rpc.CordaRPCConnection
import net.corda.core.messaging.CordaRPCOps
import net.corda.core.utilities.NetworkHostAndPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

private const val CORDA_USER_NAME = "config.rpc.username"
private const val CORDA_USER_PASSWORD = "config.rpc.password"
private const val CORDA_NODE_HOST = "config.rpc.host"
private const val CORDA_RPC_PORT = "config.rpc.port"

/**
 * Holds the RPC connection to this portal's Corda node. Connection details come from the
 * command-line arguments passed by the runUniversityServer / runStudentServer / runEmployerServer tasks.
 */
@Component
open class NodeRPCConnection(
    @Value("\${$CORDA_NODE_HOST}") private val host: String,
    @Value("\${$CORDA_USER_NAME}") private val username: String,
    @Value("\${$CORDA_USER_PASSWORD}") private val password: String,
    @Value("\${$CORDA_RPC_PORT}") private val rpcPort: Int
) : AutoCloseable {

    lateinit var rpcConnection: CordaRPCConnection
        private set
    lateinit var proxy: CordaRPCOps
        private set

    @PostConstruct
    fun initialiseNodeRPCConnection() {
        val rpcClient = CordaRPCClient(NetworkHostAndPort(host, rpcPort))
        rpcConnection = rpcClient.start(username, password)
        proxy = rpcConnection.proxy
    }

    @PreDestroy
    override fun close() {
        rpcConnection.notifyServerAndClose()
    }
}
