package com.zapp.swapmanager.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme(
    primary = Primary,
    secondary = SsdColor,
    tertiary = HddColor,
    background = Background,
    surface = Surface,
    onPrimary = Background,
    onSecondary = Background,
    onTertiary = Background,
    onBackground = TextMain,
    onSurface = TextMain
)

@Composable
fun ZappSwapManagerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
