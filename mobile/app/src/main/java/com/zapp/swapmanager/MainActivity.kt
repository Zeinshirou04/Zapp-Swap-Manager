package com.zapp.swapmanager

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Queue
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.zapp.swapmanager.data.model.HealthResponse
import com.zapp.swapmanager.data.model.Job
import com.zapp.swapmanager.data.repository.ZappRepository
import com.zapp.swapmanager.ui.screens.DashboardScreen
import com.zapp.swapmanager.ui.screens.GamesScreen
import com.zapp.swapmanager.ui.screens.QueueScreen
import com.zapp.swapmanager.ui.screens.SettingsScreen
import com.zapp.swapmanager.ui.theme.Background
import com.zapp.swapmanager.ui.theme.Primary
import com.zapp.swapmanager.ui.theme.Surface
import com.zapp.swapmanager.ui.theme.ZappSwapManagerTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var repository: ZappRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = ZappRepository(this)

        setContent {
            ZappSwapManagerTheme {
                MainAppScreen(repository)
            }
        }
    }
}

@Composable
fun MainAppScreen(repository: ZappRepository) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val coroutineScope = rememberCoroutineScope()

    val libraries by repository.librariesFlow.collectAsState(initial = emptyList())
    val games by repository.gamesFlow.collectAsState(initial = emptyList())
    var jobs by remember { mutableStateOf<List<Job>>(emptyList()) }
    var health by remember { mutableStateOf<HealthResponse?>(null) }
    var isSyncing by remember { mutableStateOf(false) }
    var actionLoading by remember { mutableStateOf(false) }

    fun refreshAll() {
        coroutineScope.launch {
            isSyncing = true
            repository.sync()
            runCatching {
                health = repository.getHealth()
                jobs = repository.listJobs()
            }
            isSyncing = false
        }
    }

    LaunchedEffect(Unit) {
        refreshAll()
    }

    Scaffold(
        containerColor = Background,
        bottomBar = {
            NavigationBar(containerColor = Surface) {
                NavigationBarItem(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    icon = { Icon(Icons.Default.Dashboard, contentDescription = "Dashboard") },
                    label = { Text("Dashboard") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Background,
                        indicatorColor = Primary
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    icon = { Icon(Icons.Default.List, contentDescription = "Games") },
                    label = { Text("Games") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Background,
                        indicatorColor = Primary
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 2,
                    onClick = {
                        selectedTab = 2
                        coroutineScope.launch {
                            runCatching { jobs = repository.listJobs() }
                        }
                    },
                    icon = { Icon(Icons.Default.Queue, contentDescription = "Queue") },
                    label = { Text("Queue") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Background,
                        indicatorColor = Primary
                    )
                )
                NavigationBarItem(
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 },
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                    label = { Text("Settings") },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Background,
                        indicatorColor = Primary
                    )
                )
            }
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            when (selectedTab) {
                0 -> DashboardScreen(
                    health = health,
                    libraries = libraries,
                    onSync = { refreshAll() },
                    syncing = isSyncing
                )
                1 -> GamesScreen(
                    games = games,
                    libraries = libraries,
                    onPromote = { appId, targetLibId ->
                        coroutineScope.launch {
                            actionLoading = true
                            runCatching {
                                repository.createJob("promote", appId, targetLibId)
                                refreshAll()
                            }
                            actionLoading = false
                        }
                    },
                    onEvict = { appId, targetLibId ->
                        coroutineScope.launch {
                            actionLoading = true
                            runCatching {
                                repository.createJob("evict", appId, targetLibId)
                                refreshAll()
                            }
                            actionLoading = false
                        }
                    },
                    onBackup = { appId, targetLibId ->
                        coroutineScope.launch {
                            actionLoading = true
                            runCatching {
                                repository.createJob("backup", appId, targetLibId)
                                refreshAll()
                            }
                            actionLoading = false
                        }
                    },
                    actionLoading = actionLoading
                )
                2 -> QueueScreen(
                    jobs = jobs,
                    onCancelJob = { jobId ->
                        coroutineScope.launch {
                            actionLoading = true
                            runCatching {
                                repository.cancelJob(jobId)
                                jobs = repository.listJobs()
                            }
                            actionLoading = false
                        }
                    },
                    cancelling = actionLoading
                )
                3 -> SettingsScreen(
                    currentTunnelUrl = repository.tunnelUrl,
                    currentJwt = repository.cfAccessJwt,
                    currentBearer = repository.bearerToken,
                    onSave = { tunnel, jwt, bearer ->
                        repository.tunnelUrl = tunnel
                        repository.cfAccessJwt = jwt
                        repository.bearerToken = bearer
                        repository.invalidateClient()
                        refreshAll()
                    },
                    onTestConnection = { tunnel, jwt, bearer ->
                        repository.tunnelUrl = tunnel
                        repository.cfAccessJwt = jwt
                        repository.bearerToken = bearer
                        repository.invalidateClient()
                        runCatching {
                            val h = repository.getHealth()
                            "Success! Connected to Core v${h.version}."
                        }
                    }
                )
            }
        }
    }
}
