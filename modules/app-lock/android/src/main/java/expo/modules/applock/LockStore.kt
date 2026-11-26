package expo.modules.applock

import android.app.AppOpsManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.os.SystemClock
import android.provider.Settings

/** Apps offered for locking. Each must also be listed under <queries> in the manifest. */
val SOCIAL_APPS = listOf(
  "com.instagram.android com.instagram.barcelona com.zhiliaoapp.musically com.ss.android.ugc.trill com.snapchat.android com.facebook.katana com.facebook.lite com.twitter.android com.reddit.frontpage com.google.android.youtube com.pinterest com.discord com.bereal.ft tv.twitch.android.app com.tumblr",
)

/** What the lock service needs, kept on the device so it works with the app closed and offline. */
class LockStore(private val context: Context) {
  private val prefs = context.getSharedPreferences("forma.app-lock", Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = prefs.getBoolean("enabled", false)
    set(value) = prefs.edit().putBoolean("enabled", value).apply()

  var blocked: Set<String>
    get() = prefs.getStringSet("blocked", emptySet())?.toSet() ?: emptySet()
    set(value) = prefs.edit().putStringSet("blocked", value).apply()

  fun unlockFor(ms: Long) {
    val left = ms.coerceAtLeast(0)
    prefs.edit()
      .putLong("untilWall", System.currentTimeMillis() + left)
      .putLong("untilElapsed", SystemClock.elapsedRealtime() + left)
      .putInt("boot", bootCount())
      .apply()
  }

  /**
   * Time left on the pass. Within one boot the monotonic clock also has to agree,
   * so winding the phone's clock back doesn't buy more time.
   */
  fun remainingMs(): Long {
    var left = prefs.getLong("untilWall", 0) - System.currentTimeMillis()
    if (prefs.getInt("boot", -1) == bootCount()) {
      left = minOf(left, prefs.getLong("untilElapsed", 0) - SystemClock.elapsedRealtime())
    }
    return left.coerceAtLeast(0)
  }

  private fun bootCount() = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, 0)
}

fun hasUsageAccess(context: Context): Boolean {
  val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
  val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
  } else {
    @Suppress("DEPRECATION")
    ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
  }
  return mode == AppOpsManager.MODE_ALLOWED
}

fun canLock(context: Context) = hasUsageAccess(context) && Settings.canDrawOverlays(context)
