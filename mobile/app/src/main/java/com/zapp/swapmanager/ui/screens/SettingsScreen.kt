package com.zapp.swapmanager.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.zapp.swapmanager.ui.theme.*

@Composable
fun SettingsScreen(
    currentTunnelUrl: String,
    currentJwt: String,
    currentBearer: String,
    onSave: (tunnelUrl: String, jwt: String, bearer: String) -> Unit,
    onTestConnection: suspend (tunnelUrl: String, jwt: String, bearer: String) -> Result<String>
) {
    var tunnelUrl by remember { mutableStateOf(currentTunnelUrl) }
    var jwtToken by remember { mutableStateOf(currentJwt) }
    var bearerToken by remember { mutableStateOf(currentBearer) }
    var testResult by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "Remote Connection Settings",
            style = MaterialTheme.typography.titleMedium,
            color = TextMain
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Surface),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                OutlinedTextField(
                    value = tunnelUrl,
                    onValueChange = { tunnelUrl = it },
                    label = { Text("Cloudflare Tunnel URL") },
                    placeholder = { Text("https://swap-manager.example.com") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextMain,
                        unfocusedTextColor = TextMain,
                        focusedBorderColor = Primary,
                        unfocusedBorderColor = BorderColor
                    )
                )

                OutlinedTextField(
                    value = jwtToken,
                    onValueChange = { jwtToken = it },
                    label = { Text("Cloudflare Access JWT (Cf-Access-Jwt-Assertion)") },
                    placeholder = { Text("Paste JWT assertion header token") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextMain,
                        unfocusedTextColor = TextMain,
                        focusedBorderColor = Primary,
                        unfocusedBorderColor = BorderColor
                    )
                )

                OutlinedTextField(
                    value = bearerToken,
                    onValueChange = { bearerToken = it },
                    label = { Text("Bearer Auth Secret (Optional / Local Dev)") },
                    placeholder = { Text("Bearer token") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = TextMain,
                        unfocusedTextColor = TextMain,
                        focusedBorderColor = Primary,
                        unfocusedBorderColor = BorderColor
                    )
                )

                if (testResult != null) {
                    Text(
                        text = testResult!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (testResult!!.startsWith("Success")) SuccessColor else DangerColor
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End
                ) {
                    Button(
                        onClick = {
                            onSave(tunnelUrl, jwtToken, bearerToken)
                            testResult = "Saved settings!"
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Primary)
                    ) {
                        Text("Save Settings", color = Background)
                    }
                }
            }
        }
    }
}
