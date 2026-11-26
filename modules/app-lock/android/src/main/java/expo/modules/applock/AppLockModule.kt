package expo.modules.applock

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AppLockModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AppLock")

    Function("getStatus") {
      val store = LockStore(context)
      mapOf(
        "usageAccess" to hasUsageAccess(context),
        "overlay" to Settings.canDrawOverlays(context),
        "enabled" to store.enabled,
        "blocked" to store.blocked.toList(),
        "remainingMs" to store.remainingMs().toDouble()
      )
    }

    AsyncFunction("getInstalledApps") {
      val pm = context.packageManager
      SOCIAL_APPS.mapNotNull { id ->
        try {
          mapOf("id" to id, "label" to pm.getApplicationLabel(pm.getApplicationInfo(id, 0)).toString())
        } catch (e: PackageManager.NameNotFoundException) {
          null
        }
      }
    }

    Function("openUsageAccessSettings") {
      open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    Function("openOverlaySettings") {
      open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    Function("setBlocked") { ids: List<String> ->
      LockStore(context).blocked = ids.filter { it in SOCIAL_APPS }.toSet()
    }

    Function("setUnlockedFor") { ms: Double ->
      LockStore(context).unlockFor(ms.toLong())
    }

    Function("setEnabled") { enabled: Boolean ->
      val store = LockStore(context)
      val service = Intent(context, AppLockService::class.java)
      if (enabled) {
        if (!canLock(context)) throw CodedException("ERR_APP_LOCK_PERMISSION", "Allow usage access and display over other apps first", null)
        store.enabled = true
        ContextCompat.startForegroundService(context, service)
      } else {
        store.enabled = false
        context.stopService(service)
      }
      Unit // neither branch's result can cross to JS
    }
  }

  private fun open(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
