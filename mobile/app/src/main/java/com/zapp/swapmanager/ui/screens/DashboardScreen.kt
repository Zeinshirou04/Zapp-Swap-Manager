package com.zapp.swapmanager.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zapp.swapmanager.data.model.HealthResponse
import com.zapp.swapmanager.data.model.Library
import com.zapp.swapmanager.ui.theme.*

@Composable
fun DashboardScreen(
    health: HealthResponse?,
    libraries: List<Library>,
    onSync: () -> Unit,
    syncing: Boolean
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Core Status Banner
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Surface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Core Remote Status",
                            style = MaterialTheme.typography.titleMedium
                        )
                        Text(
                            text = if (health != null) "Connected • v${health.version}" else "Offline / Tunnel Unreachable",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (health != null) SuccessColor else DangerColor
                        )
                    }

                    Button(
                        onClick = onSync,
                        enabled = !syncing,
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        Icon(Icons.Default.CloudSync, contentDescription = "Sync", modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(if (syncing) "Syncing..." else "Sync Now", color = Background)
                    }
                }

                if (health != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = if (health.steamRunning) "Steam is Active (Safe Swaps Enabled)" else "Steam is Idle",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (health.steamRunning) WarningColor else SuccessColor
                    )
                }
            }
        }

        Text(
            text = "Storage Drives",
            style = MaterialTheme.typography.titleMedium,
            color = TextMain
        )

        // Storage Library Meters
        libraries.forEach { lib ->
            val isSsd = lib.type == "ssd_cache"
            val usedBytes = (lib.totalBytes - lib.freeBytes).coerceAtLeast(0)
            val usedPercent = if (lib.totalBytes > 0) {
                ((usedBytes.toFloat() / lib.totalBytes.toFloat()) * 100).toInt().coerceIn(0, 100)
            } else 0
            val color = if (isSsd) SsdColor else HddColor

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Surface),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (isSsd) Icons.Default.Speed else Icons.Default.Storage,
                                contentDescription = null,
                                tint = color,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(text = lib.name, style = MaterialTheme.typography.titleMedium)
                                Text(text = "ID: ${lib.id}", style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        Text(
                            text = if (isSsd) "SSD CACHE" else "HDD MASTER",
                            style = MaterialTheme.typography.bodySmall,
                            color = color
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(text = "Storage Used", style = MaterialTheme.typography.bodySmall)
                        Text(text = "$usedPercent%", style = MaterialTheme.typography.bodySmall)
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    LinearProgressIndicator(
                        progress = { usedPercent / 100f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = color,
                        trackColor = Color.White.copy(alpha = 0.1f)
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Free: ${formatBytes(lib.freeBytes)}",
                            style = MaterialTheme.typography.bodySmall
                        )
                        Text(
                            text = "Total: ${formatBytes(lib.totalBytes)}",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
        }
    }
}

private fun formatBytes(bytes: Long): String {
    val gb = bytes.toDouble() / (1024 * 1024 * 1024)
    return if (gb >= 1000) {
        String.format("%.2f TB", gb / 1024)
    } else {
        String.format("%.1f GB", gb)
    }
}
