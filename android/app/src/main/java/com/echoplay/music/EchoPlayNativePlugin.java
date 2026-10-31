package com.echoplay.music;

import android.app.Activity;
import androidx.activity.result.ActivityResult;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.database.Cursor;

import androidx.documentfile.provider.DocumentFile;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.function.Consumer;

@CapacitorPlugin(name = "EchoPlayNative")
public class EchoPlayNativePlugin extends Plugin {
    private static final String PREFS = "echoplay_library";
    private static final String LIBRARY_KEY = "tracks";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private MediaController controller;
    private ListenableFuture<MediaController> controllerFuture;
    private boolean playerListenerAttached = false;
    private volatile String desiredRepeatMode = "all";
    private volatile boolean desiredShuffle = false;
    private volatile float desiredVolume = 1.0f;

    @Override
    public void load() {
        // The playback service is started lazily, only when the user starts playback.
    }

    @PluginMethod
    public void getLibrary(PluginCall call) {
        call.resolve(new JSObject().put("tracks", readLibrary()));
    }

    @PluginMethod
    public void pickAudioFiles(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleAudioFilesResult");
    }

    @ActivityCallback
    private void handleAudioFilesResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.resolve(new JSObject().put("tracks", readLibrary()).put("cancelled", true));
            return;
        }
        Intent data = result.getData();
        ArrayList<Uri> selected = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) selected.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            selected.add(data.getData());
        }
        int before = readLibrary().length();
        int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        for (Uri uri : selected) {
            try { getContext().getContentResolver().takePersistableUriPermission(uri, flags & Intent.FLAG_GRANT_READ_URI_PERMISSION); }
            catch (SecurityException ignored) { /* Some document providers issue non-persistable grants. */ }
            addTrack(uri);
        }
        int added = Math.max(0, readLibrary().length() - before);
        call.resolve(new JSObject().put("tracks", readLibrary()).put("added", added));
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "handleFolderResult");
    }

    @ActivityCallback
    private void handleFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("tracks", readLibrary()).put("cancelled", true));
            return;
        }
        Uri treeUri = result.getData().getData();
        int flags = result.getData().getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try { getContext().getContentResolver().takePersistableUriPermission(treeUri, flags & Intent.FLAG_GRANT_READ_URI_PERMISSION); }
        catch (SecurityException ignored) { }

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        int before = readLibrary().length();
        if (root != null && root.isDirectory()) scanFolder(root);
        int added = Math.max(0, readLibrary().length() - before);
        call.resolve(new JSObject().put("tracks", readLibrary()).put("added", added));
    }

    private void scanFolder(DocumentFile directory) {
        try {
            DocumentFile[] children = directory.listFiles();
            if (children == null) return;
            for (DocumentFile child : children) {
                try {
                    if (child.isDirectory()) {
                        scanFolder(child);
                    } else if (child.isFile() && isAudio(child.getName(), child.getType())) {
                        addTrack(child.getUri());
                    }
                } catch (SecurityException ignored) {
                    // Skip a child that the selected document provider does not expose.
                }
            }
        } catch (SecurityException ignored) {
            // Keep importing accessible files even if a nested directory is restricted.
        }
    }

    private boolean isAudio(String name, String mime) {
        if (mime != null && mime.toLowerCase().startsWith("audio/")) return true;
        if (name == null) return false;
        return name.matches("(?i).*\\.(mp3|m4a|aac|wav|ogg|flac|opus|weba|3gp|amr)$");
    }

    private void addTrack(Uri uri) {
        JSONArray library = readLibrary();
        String value = uri.toString();
        for (int i = 0; i < library.length(); i++) {
            JSONObject existing = library.optJSONObject(i);
            if (existing != null && value.equals(existing.optString("uri"))) return;
        }
        String name = queryDisplayName(uri);
        if (name == null || name.trim().isEmpty()) name = "Unknown audio";
        String title = name.replaceFirst("(?i)\\.[^.]+$", "");
        JSONObject track = new JSONObject();
        try {
            track.put("id", value);
            track.put("uri", value);
            track.put("name", name);
            track.put("title", title);
            track.put("artist", "Local audio");
            track.put("mimeType", getContext().getContentResolver().getType(uri));
            library.put(track);
            saveLibrary(library);
        } catch (JSONException ignored) { }
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return uri.getLastPathSegment();
    }

    private JSONArray readLibrary() {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(LIBRARY_KEY, "[]");
        try { return new JSONArray(raw); }
        catch (JSONException e) { return new JSONArray(); }
    }

    private void saveLibrary(JSONArray library) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(LIBRARY_KEY, library.toString()).apply();
    }

    @PluginMethod
    public void clearLibrary(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(LIBRARY_KEY).apply();
        call.resolve(new JSObject().put("success", true));
    }

    @PluginMethod
    public void playQueue(PluginCall call) {
        JSArray tracks = call.getArray("tracks");
        int startIndex = call.getInt("startIndex", 0);
        long startPosition = call.getLong("startPosition", 0L);
        boolean playWhenReady = call.getBoolean("playWhenReady", true);
        if (tracks == null || tracks.length() == 0) { call.reject("The playback queue is empty."); return; }
        ArrayList<MediaItem> items = new ArrayList<>();
        try {
            for (int i = 0; i < tracks.length(); i++) {
                JSObject track = JSObject.fromJSONObject(tracks.getJSONObject(i));
                String uri = track.getString("uri");
                String title = track.getString("title", "Unknown audio");
                String artist = track.getString("artist", "Local audio");
                MediaMetadata metadata = new MediaMetadata.Builder().setTitle(title).setArtist(artist).build();
                items.add(new MediaItem.Builder().setMediaId(uri).setUri(Uri.parse(uri)).setMediaMetadata(metadata).build());
            }
        } catch (Exception e) { call.reject("Could not prepare the playback queue.", e); return; }
        withController(call, mediaController -> {
            int safeIndex = Math.max(0, Math.min(startIndex, items.size() - 1));
            mediaController.setRepeatMode("one".equals(desiredRepeatMode) ? Player.REPEAT_MODE_ONE : "off".equals(desiredRepeatMode) ? Player.REPEAT_MODE_OFF : Player.REPEAT_MODE_ALL);
            mediaController.setShuffleModeEnabled(desiredShuffle);
            mediaController.setVolume(desiredVolume);
            mediaController.setMediaItems(items, safeIndex, Math.max(0L, startPosition));
            mediaController.prepare();
            if (playWhenReady) mediaController.play(); else mediaController.pause();
            call.resolve(new JSObject().put("success", true));
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, c -> { c.play(); call.resolve(); });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, c -> { c.pause(); call.resolve(); });
    }

    @PluginMethod
    public void togglePlay(PluginCall call) {
        withController(call, c -> { if (c.isPlaying()) c.pause(); else c.play(); call.resolve(); });
    }

    @PluginMethod
    public void next(PluginCall call) {
        withController(call, c -> { c.seekToNextMediaItem(); call.resolve(); });
    }

    @PluginMethod
    public void previous(PluginCall call) {
        withController(call, c -> {
            if (c.getCurrentPosition() > 3000) c.seekTo(0);
            else c.seekToPreviousMediaItem();
            call.resolve();
        });
    }

    @PluginMethod
public void seekTo(PluginCall call) {
    double requestedPosition = call.getData().optDouble("position", 0.0);
    long position = Math.max(0L, Math.round(requestedPosition));

    android.util.Log.d("EchoPlaySeek", "Requested position: " + position + " ms");

    withController(call, c -> {
        c.seekTo(position);

        android.util.Log.d(
            "EchoPlaySeek",
            "Player position after seek request: " + c.getCurrentPosition() + " ms"
        );

        call.resolve(
            new JSObject()
                .put("requestedPosition", position)
        );
    });
}

    @PluginMethod
    public void setRepeatMode(PluginCall call) {
        String mode = call.getString("mode", "all");
        desiredRepeatMode = mode;
        mainHandler.post(() -> {
            if (controller == null) {
                call.resolve();
                return;
            }
            runControllerAction(call, controller, c -> {
                c.setRepeatMode(repeatModeValue(mode));
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void setShuffleEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        desiredShuffle = enabled;
        mainHandler.post(() -> {
            if (controller == null) {
                call.resolve();
                return;
            }
            runControllerAction(call, controller, c -> {
                c.setShuffleModeEnabled(enabled);
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        double volume = call.getDouble("volume", 1.0);
        desiredVolume = (float) Math.max(0.0, Math.min(1.0, volume));
        mainHandler.post(() -> {
            if (controller == null) {
                call.resolve();
                return;
            }
            runControllerAction(call, controller, c -> {
                c.setVolume(desiredVolume);
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void stopPlayback(PluginCall call) {
        mainHandler.post(() -> {
            if (controller == null) {
                call.resolve();
                return;
            }
            runControllerAction(call, controller, c -> {
                c.pause();
                c.clearMediaItems();
                c.stop();
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        mainHandler.post(() -> {
            if (controller == null) {
                call.resolve(idlePlaybackState());
                return;
            }
            runControllerAction(call, controller, c -> call.resolve(snapshot(c)));
        });
    }

    private JSObject idlePlaybackState() {
        return new JSObject().put("isPlaying", false).put("currentIndex", -1)
                .put("position", 0).put("duration", 0);
    }

    private int repeatModeValue(String mode) {
        return "one".equals(mode) ? Player.REPEAT_MODE_ONE
                : "off".equals(mode) ? Player.REPEAT_MODE_OFF
                : Player.REPEAT_MODE_ALL;
    }

    private void runControllerAction(PluginCall call, MediaController target,
                                     Consumer<MediaController> action) {
        // MediaController methods MUST run on its own application looper.
        Handler controllerHandler = new Handler(target.getApplicationLooper());
        controllerHandler.post(() -> {
            try {
                action.accept(target);
            } catch (RuntimeException e) {
                call.reject("Android playback operation failed.", e);
            }
        });
    }

    private JSObject snapshot(Player player) {
        long duration = player.getDuration();
        if (duration < 0) duration = 0;
        return new JSObject()
                .put("isPlaying", player.isPlaying())
                .put("currentIndex", player.getCurrentMediaItemIndex())
                .put("position", Math.max(0L, player.getCurrentPosition()))
                .put("duration", duration)
                .put("playbackState", player.getPlaybackState());
    }

    private void withController(PluginCall call, Consumer<MediaController> action) {
        // Serialize controller creation and access on the main looper. The builder is
        // explicitly configured to use this same looper, avoiding bridge-thread races.
        mainHandler.post(() -> {
            if (controller != null) {
                runControllerAction(call, controller, action);
                return;
            }

            if (controllerFuture == null) {
                Context context = getContext();
                SessionToken token = new SessionToken(
                        context, new ComponentName(context, EchoPlaybackService.class));
                controllerFuture = new MediaController.Builder(context, token)
                        .setApplicationLooper(Looper.getMainLooper())
                        .buildAsync();
            }

            ListenableFuture<MediaController> future = controllerFuture;
            future.addListener(() -> {
                try {
                    MediaController connected = future.get();
                    controller = connected;
                    attachPlayerListener(connected);
                    runControllerAction(call, connected, action);
                } catch (ExecutionException | CancellationException e) {
                    controllerFuture = null;
                    call.reject("Could not connect to the Android playback service.", e);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    controllerFuture = null;
                    call.reject("Connection to the Android playback service was interrupted.", e);
                }
            }, command -> mainHandler.post(command));
        });
    }

    private void attachPlayerListener(MediaController player) {
        if (playerListenerAttached) return;
        playerListenerAttached = true;
        player.addListener(new Player.Listener() {
            @Override public void onEvents(Player p, Player.Events events) {
                notifyListeners("playbackState", snapshot(p));
            }
        });
    }
}
