#!/bin/bash
set -e

SOURCE_IMG="${1:-src/assets/images/taraneem_app_icon_1791211826791.jpg}"

if [ ! -f "$SOURCE_IMG" ]; then
  echo "Source image not found: $SOURCE_IMG"
  exit 1
fi

echo "Generating Android and Web icons from $SOURCE_IMG..."

# Ensure target directories
mkdir -p resources
cp "$SOURCE_IMG" resources/icon.png
mkdir -p public
mkdir -p android/app/src/main/res/values
mkdir -p android/app/src/main/res/drawable
mkdir -p android/app/src/main/res/mipmap-anydpi-v26
mkdir -p resources/android/res/values
mkdir -p resources/android/res/drawable
mkdir -p resources/android/res/mipmap-anydpi-v26

# Public / Web / PWA icons
convert "$SOURCE_IMG" -resize 32x32 public/favicon.png
convert "$SOURCE_IMG" -resize 32x32 public/favicon.ico
convert "$SOURCE_IMG" -resize 180x180 public/apple-touch-icon.png
convert "$SOURCE_IMG" -resize 192x192 public/icon-192.png
convert "$SOURCE_IMG" -resize 512x512 public/icon-512.png
convert "$SOURCE_IMG" -resize 512x512 public/icon.png

# Android mipmap densities and dimensions
# mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192
densities=("mdpi:48:108:76" "hdpi:72:162:114" "xhdpi:96:216:152" "xxhdpi:144:324:228" "xxxhdpi:192:432:304")

for item in "${densities[@]}"; do
  IFS=":" read -r name size fg_size fg_inner <<< "$item"
  echo "Processing density: $name ($size x $size, foreground $fg_size x $fg_size)..."

  mkdir -p "android/app/src/main/res/mipmap-$name"
  mkdir -p "resources/android/res/mipmap-$name"

  # Standard launcher icon
  convert "$SOURCE_IMG" -resize "${size}x${size}" "android/app/src/main/res/mipmap-$name/ic_launcher.png"
  cp "android/app/src/main/res/mipmap-$name/ic_launcher.png" "resources/android/res/mipmap-$name/ic_launcher.png"

  # Round launcher icon
  r=$((size / 2))
  convert "$SOURCE_IMG" -resize "${size}x${size}" \
    \( +clone -alpha extract -draw "fill black polygon 0,0 0,$size $size,$size $size,0 fill white circle $r,$r $r,0" \) \
    -alpha off -compose CopyOpacity -composite "android/app/src/main/res/mipmap-$name/ic_launcher_round.png"
  cp "android/app/src/main/res/mipmap-$name/ic_launcher_round.png" "resources/android/res/mipmap-$name/ic_launcher_round.png"

  # Foreground for adaptive icon
  convert -size "${fg_size}x${fg_size}" xc:none \
    \( "$SOURCE_IMG" -resize "${fg_inner}x${fg_inner}" \) \
    -gravity center -composite "android/app/src/main/res/mipmap-$name/ic_launcher_foreground.png"
  cp "android/app/src/main/res/mipmap-$name/ic_launcher_foreground.png" "resources/android/res/mipmap-$name/ic_launcher_foreground.png"
done

# Adaptive icon background color resource
cat > android/app/src/main/res/values/ic_launcher_background.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
EOF
cp android/app/src/main/res/values/ic_launcher_background.xml resources/android/res/values/ic_launcher_background.xml

# Adaptive icon vector background drawable
cat > android/app/src/main/res/drawable/ic_launcher_background.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="#F8FAFB"
        android:pathData="M0,0h108v108h-108z" />
</vector>
EOF
cp android/app/src/main/res/drawable/ic_launcher_background.xml resources/android/res/drawable/ic_launcher_background.xml

# Adaptive icon XMLs
cat > android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
EOF
cp android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml resources/android/res/mipmap-anydpi-v26/ic_launcher.xml

cat > android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
EOF
cp android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml resources/android/res/mipmap-anydpi-v26/ic_launcher_round.xml

echo "All icons generated successfully!"
