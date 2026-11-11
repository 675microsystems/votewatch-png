# R8 / ProGuard rules for the release build.
# The app uses org.json and HttpURLConnection (no reflection-based JSON/HTTP libraries), Room (generated code)
# and EncryptedSharedPreferences (Tink). Room and Tink ship consumer rules; these are the extras.

# Tink (used by androidx.security:security-crypto) relies on protobuf-lite fields by reflection.
-keepclassmembers class * extends com.google.crypto.tink.shaded.protobuf.GeneratedMessageLite {
    <fields>;
}
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**

# Keep line numbers for readable crash reports; hide the original file name.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
