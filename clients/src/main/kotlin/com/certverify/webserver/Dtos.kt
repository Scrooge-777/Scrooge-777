package com.certverify.webserver

import com.certverify.flows.VerificationResult
import com.certverify.states.CertificateState

/** JSON shapes used by the REST API. Dates and identities are sent as plain strings. */

data class IssueRequest(
    val certificateId: String,
    val studentName: String,
    val rollNumber: String,
    val program: String,
    val specialization: String,
    val cgpa: Double,
    val yearOfPassing: Int,
    val documentHash: String,
    val student: String
)

data class RevokeRequest(val reason: String)

data class ShareRequest(val verifier: String)

data class VerifyRequest(val certificateId: String, val university: String, val documentHash: String? = null)

data class CertificateDto(
    val certificateId: String,
    val studentName: String,
    val rollNumber: String,
    val program: String,
    val specialization: String,
    val cgpa: Double,
    val yearOfPassing: Int,
    val issueDate: String,
    val documentHash: String,
    val university: String,
    val student: String,
    val status: String,
    val revocationReason: String?,
    val relationship: String,
    val transactionId: String,
    val recordedAt: String?
) {
    companion object {
        fun from(s: CertificateState, relationship: String, txId: String, recordedAt: String?) = CertificateDto(
            certificateId = s.certificateId,
            studentName = s.studentName,
            rollNumber = s.rollNumber,
            program = s.program,
            specialization = s.specialization,
            cgpa = s.cgpa,
            yearOfPassing = s.yearOfPassing,
            issueDate = s.issueDate.toString(),
            documentHash = s.documentHash,
            university = s.university.name.toString(),
            student = s.student.name.toString(),
            status = s.status.name,
            revocationReason = s.revocationReason,
            relationship = relationship,
            transactionId = txId,
            recordedAt = recordedAt
        )
    }
}

data class VerificationDto(
    val certificateId: String,
    val outcome: String,
    val issuer: String,
    val message: String,
    val detailsDisclosed: Boolean,
    val studentName: String?,
    val rollNumber: String?,
    val program: String?,
    val specialization: String?,
    val cgpa: Double?,
    val yearOfPassing: Int?,
    val issueDate: String?,
    val revocationReason: String?,
    val ledgerTransactionId: String?,
    val checkedAt: String
) {
    companion object {
        fun from(r: VerificationResult) = VerificationDto(
            certificateId = r.certificateId,
            outcome = r.outcome.name,
            issuer = r.issuer,
            message = r.message,
            detailsDisclosed = r.detailsDisclosed,
            studentName = r.studentName,
            rollNumber = r.rollNumber,
            program = r.program,
            specialization = r.specialization,
            cgpa = r.cgpa,
            yearOfPassing = r.yearOfPassing,
            issueDate = r.issueDate?.toString(),
            revocationReason = r.revocationReason,
            ledgerTransactionId = r.ledgerTransactionId,
            checkedAt = r.checkedAt.toString()
        )
    }
}

data class ApiMessage(val message: String, val transactionId: String? = null)
