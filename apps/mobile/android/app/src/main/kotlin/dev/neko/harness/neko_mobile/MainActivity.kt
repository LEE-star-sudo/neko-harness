package dev.neko.harness.neko_mobile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "openAppDetailsSettings" -> {
                    try {
                        openAppDetailsSettings()
                        result.success(null)
                    } catch (e: ActivityNotFoundException) {
                        result.error("settings_unavailable", e.message, null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun openAppDetailsSettings() {
        startActivity(
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", packageName, null),
            ),
        )
    }

    companion object {
        // Dart 侧通过同名常量调用，改名需两侧同步。
        const val CHANNEL = "dev.neko.harness.mobile/settings"
    }
}
