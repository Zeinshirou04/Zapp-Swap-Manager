package com.zapp.swapmanager.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.zapp.swapmanager.data.model.Job
import com.zapp.swapmanager.ui.theme.*

@Composable
fun QueueScreen(
    jobs: List<Job>,
    onCancelJob: (jobId: String) -> Unit,
    cancelling: Boolean
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(16.dp)
    ) {
        Text(
            text = "Job Swap Queue",
            style = MaterialTheme.typography.titleMedium,
            color = TextMain
        )

        Spacer(modifier = Modifier.height(12.dp))

        if (jobs.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(text = "No jobs in queue", color = TextMuted)
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(jobs, key = { it.id }) { job ->
                    val isRunning = job.status == "running"
                    val isQueued = job.status == "queued"
                    val isSucceeded = job.status == "succeeded"

                    val statusColor = when {
                        isRunning -> Primary
                        isQueued -> WarningColor
                        isSucceeded -> SuccessColor
                        else -> DangerColor
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Surface),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Column(modifier = Modifier.padding(14.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = "${job.type.uppercase()} • App ID: ${job.appId}",
                                        style = MaterialTheme.typography.titleMedium
                                    )
                                    Text(
                                        text = "Target: ${job.targetLibraryId}",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = job.status.uppercase(),
                                        style = MaterialTheme.typography.bodySmall,
                                        color = statusColor
                                    )

                                    if (isRunning || isQueued) {
                                        Spacer(modifier = Modifier.width(8.dp))
                                        IconButton(
                                            onClick = { onCancelJob(job.id) },
                                            enabled = !cancelling,
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Close,
                                                contentDescription = "Cancel Job",
                                                tint = DangerColor
                                            )
                                        }
                                    }
                                }
                            }

                            if (isRunning) {
                                Spacer(modifier = Modifier.height(10.dp))
                                LinearProgressIndicator(
                                    progress = { job.progressPercent / 100f },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(6.dp)
                                        .clip(RoundedCornerShape(3.dp)),
                                    color = Primary,
                                    trackColor = Color.White.copy(alpha = 0.1f)
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "${formatBytes(job.bytesTransferred)} / ${formatBytes(job.totalBytes)}",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                    Text(
                                        text = "${job.progressPercent.toInt()}%",
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                }
                            }

                            if (!job.error.isNullOrBlank()) {
                                Spacer(modifier = Modifier.height(6.dp))
                                Text(
                                    text = job.error,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = DangerColor
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun formatBytes(bytes: Long): String {
    val gb = bytes.toDouble() / (1024 * 1024 * 1024)
    return String.format("%.2f GB", gb)
}
