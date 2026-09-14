"""Automated Single-File Setup Builder for Vvc Remote

1. Compiles VvcRemote application via build_exe.py
2. Packages dist/VvcRemote into a compressed payload archive (dist/vvc_payload.zip)
3. Compiles installer_gui.py with embedded payload into a standalone single-file setup:
   dist/VvcRemote_Setup.exe
"""
import sys
import os
import shutil
import zipfile
import subprocess
from pathlib import Path


def create_payload_zip(source_dir: Path, output_zip: Path):
    """Compresses directory contents into payload zip with maximum compression."""
    print(f"\n[1/3] Packaging '{source_dir}' into compressed payload...")
    output_zip.parent.mkdir(parents=True, exist_ok=True)
    if output_zip.exists():
        output_zip.unlink()

    total_files = sum(len(files) for _, _, files in os.walk(source_dir))
    processed = 0

    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = Path(root) / file
                archive_name = file_path.relative_to(source_dir)
                zf.write(file_path, archive_name)
                processed += 1
                if processed % 100 == 0 or processed == total_files:
                    pct = int(processed / total_files * 100)
                    print(f"  -> Compressed {processed}/{total_files} files ({pct}%)...", end="\r")

    size_mb = output_zip.stat().st_size / (1024 * 1024)
    print(f"\n  [OK] Payload created: {output_zip} ({size_mb:.1f} MB)")


def build():
    root_dir = Path(__file__).resolve().parent
    vvc_dist_dir = root_dir / "dist" / "VvcRemote"
    payload_zip = root_dir / "dist" / "vvc_payload.zip"
    icon_path = root_dir / "assets" / "icon.ico"
    installer_script = root_dir / "installer_gui.py"

    print("=" * 65)
    print("      Building Vvc Remote Single-File Setup Executable (.exe)    ")
    print("=" * 65)

    skip_core = "--fast" in sys.argv or "--skip-core" in sys.argv
    if not skip_core or not (vvc_dist_dir / "VvcRemote.exe").exists():
        # Step A: Compile core VvcRemote application with latest changes
        print("\n[Step A] Compiling core VvcRemote application...")
        build_exe_script = root_dir / "build_exe.py"
        res = subprocess.run([sys.executable, str(build_exe_script)], cwd=str(root_dir))
        if res.returncode != 0:
            print("[!] Core application compilation failed.")
            sys.exit(res.returncode)
    else:
        print("\n[Step A] Fast build: Using existing compiled core application in dist/VvcRemote...")

    # Step B: Create payload zip
    create_payload_zip(vvc_dist_dir, payload_zip)

    # Step C: Compile single-file installer via PyInstaller
    print("\n[2/3] Compiling standalone single-file installer via PyInstaller...")
    pyinstaller_args = [
        sys.executable,
        "-m", "PyInstaller",
        "--name=VvcRemote_Setup",
        "--onefile",
        "--windowed",
        f"--icon={icon_path}",
        f"--add-data={payload_zip};.",
        "--clean",
        "--noconfirm",
        str(installer_script)
    ]

    print("Executing command:\n" + " ".join(pyinstaller_args))
    print("-" * 65)

    res = subprocess.run(pyinstaller_args, cwd=str(root_dir))
    if res.returncode == 0:
        setup_exe = root_dir / "dist" / "VvcRemote_Setup.exe"
        size_mb = setup_exe.stat().st_size / (1024 * 1024)
        print("\n" + "=" * 65)
        print(" [OK] SINGLE-FILE SETUP BUILD COMPLETE!")
        print(f" [>] Output Setup File: {setup_exe}")
        print(f" [>] File Size:        {size_mb:.1f} MB")
        print(" [>] Ready for Telegram: Direct drag-and-drop .exe without zip!")
        print("=" * 65)
    else:
        print("\n[!] Installer compilation failed with exit code:", res.returncode)
        sys.exit(res.returncode)


if __name__ == "__main__":
    build()
