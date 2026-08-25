# kotlinx.serialization keeps its serializers on the companion of each class.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class com.workapp.hafaka.model.** {
    *** Companion;
}
-keepclasseswithmembers class com.workapp.hafaka.model.** {
    kotlinx.serialization.KSerializer serializer(...);
}
