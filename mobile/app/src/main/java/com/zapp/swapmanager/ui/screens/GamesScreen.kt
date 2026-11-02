package com.zapp.swapmanager.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.zapp.swapmanager.data.model.Game
import com.zapp.swapmanager.data.model.Library
import com.zapp.swapmanager.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GamesScreen(
    games: List<Game>,
    libraries: List<Library>,
    onPromote: (appId: String, targetLibraryId: String) -> Unit,
    onEvict: (appId: String, targetLibraryId: String) -> Unit,
    onBackup: (appId: String, targetLibraryId: String) -> Unit,
    actionLoading: Boolean
) {
    var searchQuery by remember { mutableStateOf("") }
    var selectedFilter by remember { mutableStateOf("all") } // "all", "active_ssd", "storage_hdd"

    val ssdLib = libraries.find { it.type == "ssd_cache" }
    val hddLib = libraries.find { it.type == "hdd_master" }

    val filteredGames = remember(games, searchQuery, selectedFilter) {
        games.filter { game ->
            val matchesQuery = game.name.contains(searchQuery, ignoreCase = true) ||
                    game.appId.toString().contains(searchQuery)
            val matchesFilter = when (selectedFilter) {
                "active_ssd" -> game.state == "active_ssd"
                "storage_hdd" -> game.state == "storage_hdd"
                else -> true
            }
            matchesQuery && matchesFilter
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(16.dp)
    ) {
        // Search TextField
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search games or App ID...", color = TextMuted) },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = TextMuted) },
            singleLine = true,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = Surface,
                unfocusedContainerColor = Surface,
                focusedTextColor = TextMain,
                unfocusedTextColor = TextMain,
                focusedBorderColor = Primary,
                unfocusedBorderColor = BorderColor
            ),
            shape = RoundedCornerShape(8.dp)
        )

        Spacer(modifier = Modifier.height(12.dp))

        // Filter chips
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = selectedFilter == "all",
                onClick = { selectedFilter = "all" },
                label = { Text("All (${games.size})") }
            )
            FilterChip(
                selected = selectedFilter == "active_ssd",
                onClick = { selectedFilter = "active_ssd" },
                label = { Text("SSD Cache") }
            )
            FilterChip(
                selected = selectedFilter == "storage_hdd",
                onClick = { selectedFilter = "storage_hdd" },
                label = { Text("HDD Storage") }
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Games List
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(filteredGames, key = { it.appId }) { game ->
                val isOnSsd = game.state == "active_ssd"

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Surface),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = game.name,
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(
                                    text = "App ID: ${game.appId} • ${formatBytes(game.sizeBytes)}",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }

                            Text(
                                text = if (isOnSsd) "ACTIVE SSD" else "STORAGE HDD",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isOnSsd) SsdColor else HddColor
                            )
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = if (game.backupClean) SuccessColor else WarningColor,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = if (game.backupClean) "Synced" else "Needs Backup",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextMuted
                                )
                            }

                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (!isOnSsd && ssdLib != null) {
                                    Button(
                                        onClick = { onPromote(game.appId.toString(), ssdLib.id) },
                                        enabled = !actionLoading,
                                        colors = ButtonDefaults.buttonColors(containerColor = Primary),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.ArrowUpward, contentDescription = null, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Promote", color = Background)
                                    }
                                }

                                if (isOnSsd && hddLib != null) {
                                    FilledTonalButton(
                                        onClick = { onBackup(game.appId.toString(), hddLib.id) },
                                        enabled = !actionLoading,
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Backup")
                                    }

                                    Button(
                                        onClick = { onEvict(game.appId.toString(), hddLib.id) },
                                        enabled = !actionLoading,
                                        colors = ButtonDefaults.buttonColors(containerColor = DangerColor.copy(alpha = 0.2f)),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Icon(Icons.Default.ArrowDownward, contentDescription = null, tint = DangerColor, modifier = Modifier.size(14.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Evict", color = DangerColor)
                                    }
                                }
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
