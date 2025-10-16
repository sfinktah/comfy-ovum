#NoEnv
#Persistent
#SingleInstance, Force
SetBatchLines, -1
SetTitleMatchMode, 2

watchDir := "C:\zluda\comfui-n2\output\video"
checkIntervalMs := 5000
postDetectDelayMs := 5000

; Track files we've already opened
opened := {}

; Initialize with current .mp4 files so we don't open existing ones
Loop, Files, %watchDir%\*.mp4
{
    opened[A_LoopFileFullPath] := true
}

SetTimer, CheckForNewMP4, %checkIntervalMs%
return

CheckForNewMP4:
{
    ; Collect current .mp4 files
    current := []
    Loop, Files, %watchDir%\*.mp4
    {
        filePath := A_LoopFileFullPath
        current.Push(filePath)
    }

    ; Find new files not in 'opened'
    for index, filePath in current
    {
        if !opened.HasKey(filePath)
        {
            ; Mark as seen to avoid duplicates during the waiting period
            opened[filePath] := true

            ; Wait to ensure file is fully written
            Sleep, %postDetectDelayMs%

            ; Optional: double-check file is stable by comparing size across short interval
            size1 := FileGetSizeEx(filePath)
            Sleep, 1000
            size2 := FileGetSizeEx(filePath)

            if (size1 = size2) {
                Run, %filePath%
            } else {
                ; If still changing, try once more after the post-detect delay
                Sleep, %postDetectDelayMs%
                Run, %filePath%
            }
        }
    }
}
return

; Helper to safely get file size (returns -1 if missing)
FileGetSizeEx(path) {
    if FileExist(path)
    {
        FileGetSize, out, %path%
        return out
    }
    return -1
}
