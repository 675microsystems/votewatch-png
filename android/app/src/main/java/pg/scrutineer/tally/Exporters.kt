package pg.scrutineer.tally

import android.content.ContentResolver
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import java.text.SimpleDateFormat
import java.time.Instant
import java.util.Date
import java.util.Locale

/** Quotes a cell and neutralises spreadsheet formula injection (=, +, -, @). */
internal fun csvCell(value: String): String {
    val oneLine = value.replace("\r", " ").replace("\n", " ")
    val safe = if (oneLine.isNotEmpty() && oneLine[0] in charArrayOf('=', '+', '-', '@', '\t')) "'$oneLine" else oneLine
    return "\"" + safe.replace("\"", "\"\"") + "\""
}

internal fun kindLabel(kind: String) =
    if (kind == RecordKind.OFFICIAL_FIGURE) "Official count figure" else "Polling place tally"

internal fun sharePct(votes: Int, cast: Int): String =
    if (cast > 0) "%.1f%%".format(Locale.ROOT, 100.0 * votes / cast) else "-"

fun exportCsv(resolver: ContentResolver, uri: Uri, records: List<TallyRecord>) {
    val out = resolver.openOutputStream(uri) ?: error("Unable to open destination for CSV export")
    out.bufferedWriter(Charsets.UTF_8).use { w ->
        w.appendLine("record_id,kind,location_path,location_type,candidate_votes,total_votes_cast,share_percent,source_reference,scrutineer,notes,device_created_at,sync_state,server_status,superseded_on_device,supersedes_record_id,correction_reason,team_id,election_id,location_id")
        records.forEach { r ->
            val cells = listOf(
                r.clientRecordId, r.kind, r.locationPath, r.locationType,
                r.candidateVotes.toString(), r.totalVotesCast.toString(), sharePct(r.candidateVotes, r.totalVotesCast),
                r.sourceReference, r.scrutineerName, r.notes,
                Instant.ofEpochMilli(r.deviceCreatedAt).toString(), r.syncState, r.serverStatus.orEmpty(),
                r.supersededLocally.toString(), r.supersedesClientRecordId.orEmpty(), r.correctionReason.orEmpty(),
                r.teamId, r.electionId, r.locationId
            )
            w.appendLine(cells.joinToString(",") { csvCell(it) })
        }
    }
}

fun exportPdf(resolver: ContentResolver, uri: Uri, records: List<TallyRecord>) {
    val pdf = PdfDocument()
    val paint = Paint()
    var pageNumber = 1
    var page = pdf.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
    var canvas = page.canvas
    var y = 42f

    fun line(text: String, bold: Boolean = false) {
        paint.textSize = if (bold) 12f else 10f
        paint.isFakeBoldText = bold
        text.chunked(95).forEach { chunk ->
            if (y > 790f) {
                pdf.finishPage(page)
                pageNumber++
                page = pdf.startPage(PdfDocument.PageInfo.Builder(595, 842, pageNumber).create())
                canvas = page.canvas
                y = 42f
            }
            canvas.drawText(chunk, 36f, y, paint)
            y += if (bold) 18f else 14f
        }
    }

    line("VoteWatch PNG - Team Record", true)
    line("Campaign team tallies only. NOT an official election result.")
    line("Generated: " + SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).format(Date()))
    y += 8f
    records.forEach { r ->
        y += 6f
        val tags = buildList {
            add(r.syncState)
            if (r.supersededLocally) add("SUPERSEDED")
            if (r.supersedesClientRecordId != null) add("CORRECTION")
        }.joinToString(", ")
        line("${r.locationPath} [$tags]", true)
        line("${kindLabel(r.kind)} | Votes: ${r.candidateVotes} of ${r.totalVotesCast} cast (${sharePct(r.candidateVotes, r.totalVotesCast)})")
        line("By ${r.scrutineerName} at " + SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).format(Date(r.deviceCreatedAt)) +
            " | ID ${r.clientRecordId.take(8)}" + (if (r.sourceReference.isNotBlank()) " | Ref ${r.sourceReference}" else ""))
        if (r.notes.isNotBlank()) line("   Note: ${r.notes}")
        if (!r.correctionReason.isNullOrBlank()) line("   Correction reason: ${r.correctionReason}")
    }
    pdf.finishPage(page)
    val out = resolver.openOutputStream(uri) ?: error("Unable to open destination for PDF export")
    out.use { pdf.writeTo(it) }
    pdf.close()
}
