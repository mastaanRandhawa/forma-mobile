package expo.modules.applock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/** Turns the lock back on after a restart or an app update. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (LockStore(context).enabled) {
      ContextCompat.startForegroundService(context, Intent(context, AppLockService::class.java))
    }
  }
}
