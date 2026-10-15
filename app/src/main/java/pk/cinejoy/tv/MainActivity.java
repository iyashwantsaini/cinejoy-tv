package pk.cinejoy.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.annotation.RequiresApi;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class MainActivity extends Activity {
    private static final String TAG = "CinejoyTV";
    private static final int PICK_FILE = 20;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private FrameLayout browserContainer;
    private FrameLayout fullscreenContainer;
    private LinearLayout toolbar;
    private LinearLayout errorPanel;
    private TextView errorText;
    private ProgressBar progress;
    private Button browseButton;
    private WebView webView;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;
    private ValueCallback<Uri[]> fileCallback;
    private AlertDialog activeDialog;
    private String siteUrl;
    private String script;
    private String retryUrl;
    private boolean pageFailed;
    private boolean resumed;
    private boolean centerHeld;
    private boolean centerDown;
    private boolean messageBridge;
    private long lastNotice;
    private final Runnable timeout = () -> showError(getString(R.string.load_timeout));
    private final Runnable longPress = () -> {
        centerHeld = true;
        showMenu();
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildLayout();
        try (InputStream input = getAssets().open("tv-navigation.js");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            script = output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            Log.e(TAG, "Cannot load bundled navigation script", e);
            showError(getString(R.string.script_error));
            return;
        }
        siteUrl = preferences().getString(SettingsActivity.URL, SiteUrl.DEFAULT);
        retryUrl = siteUrl;
        if (createBrowser()) {
            if (state == null || !siteUrl.equals(state.getString("site")) ||
                    webView.restoreState(state) == null) {
                webView.loadUrl(siteUrl);
            }
        }
    }

    private SharedPreferences preferences() {
        return getSharedPreferences(SettingsActivity.PREFS, MODE_PRIVATE);
    }

    private void buildLayout() {
        root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        root.addView(content, new FrameLayout.LayoutParams(-1, -1));
        toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(TvUi.dp(this, 20), TvUi.dp(this, 2), TvUi.dp(this, 20), TvUi.dp(this, 2));
        content.addView(toolbar, new LinearLayout.LayoutParams(-1, TvUi.dp(this, 60)));
        browseButton = TvUi.button(this, R.string.browse, v -> browse());
        toolbar.addView(browseButton);
        toolbar.addView(TvUi.button(this, R.string.home, v -> {
            hideFullscreen();
            if (webView != null) webView.loadUrl(siteUrl);
        }));
        toolbar.addView(TvUi.button(this, R.string.reload, v -> retry()));
        toolbar.addView(TvUi.button(this, R.string.player, v -> showPlayerControls()));
        toolbar.addView(TvUi.button(this, R.string.settings, v -> openSettings()));
        toolbar.addView(TvUi.button(this, R.string.help, v -> showHelp()));
        for (int i = 0; i < toolbar.getChildCount(); i++) {
            toolbar.getChildAt(i).setOnKeyListener((v, code, event) -> {
                if (code == KeyEvent.KEYCODE_DPAD_DOWN) {
                    if (event.getAction() == KeyEvent.ACTION_DOWN) browse();
                    return true;
                }
                return false;
            });
        }
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setContentDescription(getString(R.string.loading));
        content.addView(progress, new LinearLayout.LayoutParams(-1, TvUi.dp(this, 3)));
        browserContainer = new FrameLayout(this);
        content.addView(browserContainer, new LinearLayout.LayoutParams(-1, 0, 1));
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(TvUi.dp(this, 48), TvUi.dp(this, 24), TvUi.dp(this, 48), TvUi.dp(this, 24));
        errorPanel.setBackgroundColor(Color.rgb(16, 20, 28));
        errorPanel.addView(TvUi.text(this, getString(R.string.load_failed), 28));
        errorText = TvUi.text(this, "", 18);
        errorText.setGravity(Gravity.CENTER);
        errorPanel.addView(errorText);
        LinearLayout errorActions = new LinearLayout(this);
        errorActions.addView(TvUi.button(this, R.string.retry, v -> retry()));
        errorActions.addView(TvUi.button(this, R.string.settings, v -> openSettings()));
        errorPanel.addView(errorActions);
        errorPanel.setVisibility(View.GONE);
        browserContainer.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);
        root.addView(fullscreenContainer, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        browseButton.requestFocus();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private boolean createBrowser() {
        if (WebViewCompat.getCurrentWebViewPackage(this) == null) {
            showError(getString(R.string.webview_missing));
            return false;
        }
        WebView browser = new WebView(this);
        webView = browser;
        browser.setId(View.generateViewId());
        browser.setBackgroundColor(Color.rgb(16, 20, 28));
        browser.setFocusable(true);
        browser.setFocusableInTouchMode(true);
        browser.setNextFocusUpId(browseButton.getId());
        browserContainer.addView(browser, 0, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        Matcher chrome = Pattern.compile("Chrome/[\\d.]+").matcher(settings.getUserAgentString());
        if (chrome.find()) {
            settings.setUserAgentString("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    + "(KHTML, like Gecko) " + chrome.group() + " Safari/537.36");
        }
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        messageBridge = WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(browser, "TvShell",
                    Collections.singleton(SiteUrl.origin(siteUrl)),
                    (view, message, sourceOrigin, isMainFrame, reply) -> {
                        if (view == webView && isMainFrame &&
                                SiteUrl.isSameOrigin(siteUrl, sourceOrigin.toString())) {
                            if (message.getType() == WebMessageCompat.TYPE_STRING) handleAction(message.getData());
                            else Log.w(TAG, "Ignored non-text navigation message");
                        }
                    });
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(browser, script, Collections.singleton("*"));
        } else {
            notice(getString(R.string.webview_old));
        }
        browser.setWebViewClient(new BrowserClient());
        browser.setWebChromeClient(new ChromeClient());
        browser.setDownloadListener((url, agent, disposition, mime, size) ->
                notice(getString(R.string.download_blocked)));
        return true;
    }

    private final class BrowserClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (SiteUrl.isSameOrigin(siteUrl, url)) return false;
            notice(getString(R.string.external_blocked));
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (!request.isForMainFrame()) {
                return !("https".equals(request.getUrl().getScheme()) || "about".equals(request.getUrl().getScheme()));
            }
            if (SiteUrl.isSameOrigin(siteUrl, url)) return false;
            notice(getString(R.string.external_blocked));
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (!SiteUrl.isSameOrigin(siteUrl, url)) {
                view.stopLoading();
                showError(getString(R.string.external_blocked));
                return;
            }
            retryUrl = url;
            pageFailed = false;
            errorPanel.setVisibility(View.GONE);
            progress.setVisibility(View.VISIBLE);
            handler.removeCallbacks(timeout);
            handler.postDelayed(timeout, 30000);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (view != webView || pageFailed || !SiteUrl.isSameOrigin(siteUrl, url)) return;
            handler.removeCallbacks(timeout);
            progress.setVisibility(View.GONE);
            view.evaluateJavascript(script, null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError(getString(R.string.load_error, error.getDescription()));
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                showError(getString(R.string.http_error, response.getStatusCode()));
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler sslHandler, SslError error) {
            sslHandler.cancel();
            if (error.getUrl().equals(view.getUrl())) showError(getString(R.string.tls_error));
            else notice(getString(R.string.tls_error));
        }

        @Override
        @RequiresApi(26)
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            Log.e(TAG, "WebView renderer exited; crashed=" + detail.didCrash());
            hideFullscreen();
            browserContainer.removeView(view);
            view.destroy();
            if (view == webView) webView = null;
            showError(getString(R.string.renderer_error));
            return true;
        }
    }

    private final class ChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int value) {
            progress.setProgress(value);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, android.os.Message result) {
            notice(getString(R.string.popup_blocked));
            return false;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
            notice(getString(R.string.permission_blocked));
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("*/*")
                    .putExtra(Intent.EXTRA_TITLE, getString(R.string.file_picker_title));
            try {
                startActivityForResult(picker, PICK_FILE);
            } catch (ActivityNotFoundException e) {
                Log.w(TAG, "No document picker installed", e);
                fileCallback = null;
                callback.onReceiveValue(null);
                notice(getString(R.string.file_picker_missing));
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (fullscreenView != null) {
                callback.onCustomViewHidden();
                return;
            }
            fullscreenView = view;
            fullscreenCallback = callback;
            fullscreenContainer.addView(view, new FrameLayout.LayoutParams(-1, -1));
            fullscreenContainer.setVisibility(View.VISIBLE);
            fullscreenContainer.requestFocus();
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        @Override
        public void onHideCustomView() {
            hideFullscreen();
        }
    }

    private void hideFullscreen() {
        if (fullscreenView == null) return;
        fullscreenContainer.removeView(fullscreenView);
        fullscreenContainer.setVisibility(View.GONE);
        fullscreenView = null;
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenCallback = null;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (callback != null) callback.onCustomViewHidden();
        if (webView != null) webView.requestFocus();
    }

    private void showError(String message) {
        if (isFinishing() || isDestroyed()) return;
        pageFailed = true;
        handler.removeCallbacks(timeout);
        progress.setVisibility(View.GONE);
        hideFullscreen();
        errorText.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
        errorPanel.bringToFront();
        errorPanel.requestFocus();
        Log.w(TAG, message);
    }

    private void retry() {
        if (script == null) {
            notice(getString(R.string.script_error));
            return;
        }
        hideFullscreen();
        if (webView == null && !createBrowser()) return;
        webView.loadUrl(SiteUrl.isSameOrigin(siteUrl, retryUrl) ? retryUrl : siteUrl);
    }

    private void browse() {
        if (webView == null || pageFailed) return;
        webView.requestFocus();
        command("focus");
    }

    private void command(String name) {
        command(name, null);
    }

    private void command(String name, JSONObject args) {
        if (webView == null) return;
        if ("activate".equals(name) || "fullscreen".equals(name)) {
            WebView target = webView;
            // File pickers and fullscreen need Chromium's trusted keyboard-activation path.
            target.evaluateJavascript("window.CinejoyTV && window.CinejoyTV.command('arm',{name:"
                    + JSONObject.quote(name) + "})", result -> {
                if (target != webView || !resumed) return;
                if (!"true".equals(result)) {
                    notice(getString(R.string.navigation_unavailable));
                    return;
                }
                target.requestFocus();
                long time = android.os.SystemClock.uptimeMillis();
                target.dispatchKeyEvent(new KeyEvent(time, time, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER, 0));
                target.dispatchKeyEvent(new KeyEvent(time, time, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER, 0));
            });
            return;
        }
        String expression = "window.CinejoyTV ? window.CinejoyTV.command(" + JSONObject.quote(name)
                + "," + (args == null ? "null" : args.toString()) + ") : null";
        webView.evaluateJavascript(expression, result -> {
            if ("null".equals(result)) {
                if ("back".equals(name)) navigateBack();
                else if (!"pauseAll".equals(name)) notice(getString(R.string.navigation_unavailable));
            } else if (!messageBridge && result != null && result.startsWith("{")) {
                handleAction(result);
            }
        });
    }

    private void handleAction(String json) {
        if (!resumed || json == null || json.length() > 60000) return;
        try {
            JSONObject action = new JSONObject(json);
            switch (action.optString("type")) {
                case "toolbar":
                    if (fullscreenView != null) showMenu();
                    else {
                        command("blur");
                        browseButton.requestFocus();
                    }
                    break;
                case "back":
                    navigateBack();
                    break;
                case "message":
                    notice(action.optString("text").substring(0, Math.min(300, action.optString("text").length())));
                    break;
                case "edit":
                    showTextEntry(action);
                    break;
                case "select":
                    showSelection(action);
                    break;
                default:
                    Log.w(TAG, "Ignored unknown navigation action");
            }
        } catch (JSONException e) {
            Log.w(TAG, "Invalid navigation message", e);
            notice(getString(R.string.navigation_unavailable));
        }
    }

    private boolean dialogShowing() {
        return activeDialog != null && activeDialog.isShowing();
    }

    private void display(AlertDialog dialog) {
        if (dialogShowing()) return;
        activeDialog = dialog;
        dialog.setOnDismissListener(ignored -> activeDialog = null);
        dialog.show();
    }

    private void showTextEntry(JSONObject action) throws JSONException {
        if (dialogShowing()) return;
        String token = action.getString("token");
        String type = action.optString("inputType", "text");
        EditText field = new EditText(this);
        field.setTextSize(22);
        field.setSingleLine(!"textarea".equals(type));
        int inputType = InputType.TYPE_CLASS_TEXT;
        if ("password".equals(type)) inputType |= InputType.TYPE_TEXT_VARIATION_PASSWORD;
        else if ("email".equals(type)) inputType |= InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;
        else if ("url".equals(type)) inputType |= InputType.TYPE_TEXT_VARIATION_URI;
        else if ("number".equals(type)) inputType = InputType.TYPE_CLASS_NUMBER |
                InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED;
        else if ("tel".equals(type)) inputType = InputType.TYPE_CLASS_PHONE;
        field.setInputType(inputType);
        field.setText(action.optString("value").substring(0, Math.min(10000, action.optString("value").length())));
        field.setSelectAllOnFocus(true);
        int padding = TvUi.dp(this, 24);
        LinearLayout container = new LinearLayout(this);
        container.setPadding(padding, padding / 2, padding, 0);
        container.addView(field, new LinearLayout.LayoutParams(-1, -2));
        String label = action.optString("label");
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(label.isEmpty() ? getString(R.string.edit_text) : label.substring(0, Math.min(100, label.length())))
                .setView(container)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.apply, (d, which) -> {
                    JSONObject args = new JSONObject();
                    try {
                        args.put("token", token);
                        args.put("value", field.getText().toString());
                    } catch (JSONException e) {
                        throw new IllegalStateException("Cannot encode text entry", e);
                    }
                    if (webView != null) webView.requestFocus();
                    command("text", args);
                }).create();
        display(dialog);
        if ("password".equals(type) && dialog.getWindow() != null) {
            dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        field.requestFocus();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        }
    }

    private void showSelection(JSONObject action) throws JSONException {
        if (dialogShowing()) return;
        String token = action.getString("token");
        JSONArray options = action.getJSONArray("options");
        if (options.length() > 500) {
            notice(getString(R.string.navigation_unavailable));
            return;
        }
        String[] labels = new String[options.length()];
        boolean[] disabled = new boolean[options.length()];
        for (int i = 0; i < options.length(); i++) {
            JSONObject option = options.getJSONObject(i);
            labels[i] = option.getString("label");
            disabled[i] = option.optBoolean("disabled");
        }
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setSingleChoiceItems(labels, action.optInt("selected", -1), (d, which) -> {
                    if (disabled[which]) {
                        notice(getString(R.string.navigation_unavailable));
                        return;
                    }
                    JSONObject args = new JSONObject();
                    try {
                        args.put("token", token);
                        args.put("index", which);
                    } catch (JSONException e) {
                        throw new IllegalStateException("Cannot encode selection", e);
                    }
                    if (webView != null) webView.requestFocus();
                    command("select", args);
                    d.dismiss();
                }).setNegativeButton(R.string.cancel, null).create();
        display(dialog);
    }

    private void showMenu() {
        String[] labels = {getString(R.string.browse), getString(R.string.home),
                getString(R.string.reload), getString(R.string.player), getString(R.string.settings),
                getString(R.string.help), getString(R.string.exit)};
        display(new AlertDialog.Builder(this).setTitle(R.string.app_name).setItems(labels, (dialog, index) -> {
            // OnClick runs before Dialog.dismiss; defer dialogs opened by the chosen action.
            handler.post(() -> {
                switch (index) {
                    case 0: browse(); break;
                    case 1: hideFullscreen(); if (webView != null) webView.loadUrl(siteUrl); break;
                    case 2: retry(); break;
                    case 3: showPlayerControls(); break;
                    case 4: openSettings(); break;
                    case 5: showHelp(); break;
                    case 6: confirmExit(); break;
                    default: break;
                }
            });
        }).setNegativeButton(R.string.cancel, null).create());
    }

    private void showPlayerControls() {
        String[] labels = {getString(R.string.play_pause), getString(R.string.rewind),
                getString(R.string.forward), getString(R.string.servers), getString(R.string.subtitles),
                getString(R.string.playback_settings), getString(R.string.fullscreen)};
        String[] commands = {"playPause", "rewind", "forward", "servers", "subtitles", "settings", "fullscreen"};
        display(new AlertDialog.Builder(this).setTitle(R.string.player_title).setItems(labels, (dialog, index) -> {
            browse();
            command(commands[index]);
        }).setNegativeButton(R.string.cancel, null).create());
    }

    private void showHelp() {
        display(new AlertDialog.Builder(this).setTitle(R.string.help_title)
                .setMessage(R.string.help_text).setPositiveButton(R.string.close, null).create());
    }

    private void openSettings() {
        command("pauseAll");
        hideFullscreen();
        startActivity(new Intent(this, SettingsActivity.class));
    }

    private void confirmExit() {
        display(new AlertDialog.Builder(this).setTitle(R.string.exit_title)
                .setMessage(R.string.exit_message).setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.exit, (dialog, which) -> finish()).create());
    }

    private void navigateBack() {
        if (fullscreenView != null) hideFullscreen();
        else if (webView != null && webView.canGoBack()) webView.goBack();
        else confirmExit();
    }

    @Override
    public void onBackPressed() {
        handler.removeCallbacks(longPress);
        if (pageFailed || webView == null) navigateBack();
        else command("back");
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        if (dialogShowing()) return super.dispatchKeyEvent(event);
        boolean down = event.getAction() == KeyEvent.ACTION_DOWN;
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) {
            if (down && event.getRepeatCount() == 0) showMenu();
            return true;
        }
        boolean browsing = fullscreenView != null || (webView != null && webView.hasFocus() && !pageFailed);
        if (browsing && (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER ||
                code == KeyEvent.KEYCODE_NUMPAD_ENTER)) {
            if (down && event.getRepeatCount() == 0) {
                centerHeld = false;
                centerDown = true;
                handler.postDelayed(longPress, 650);
            } else if (!down) {
                handler.removeCallbacks(longPress);
                if (centerDown && !centerHeld && !event.isCanceled()) command("activate");
                centerDown = false;
            }
            return true;
        }
        String action = null;
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: if (browsing) action = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: if (browsing) action = "down"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: if (browsing) action = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: if (browsing) action = "right"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: action = "playPause"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY: action = "play"; break;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: action = "pause"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND: action = "rewind"; break;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: action = "forward"; break;
            default: break;
        }
        if (action != null) {
            if (down) command(action);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void notice(String text) {
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastNotice < 1500) return;
        lastNotice = now;
        Toast.makeText(this, text, Toast.LENGTH_LONG).show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        if (script == null) return;
        String configured = preferences().getString(SettingsActivity.URL, SiteUrl.DEFAULT);
        boolean reset = preferences().getBoolean(SettingsActivity.RESET, false);
        if (!configured.equals(siteUrl) || reset) {
            hideFullscreen();
            if (webView != null) {
                if (reset) webView.clearCache(true);
                destroyBrowser();
            }
            siteUrl = configured;
            retryUrl = siteUrl;
            if (createBrowser()) webView.loadUrl(siteUrl);
            if (reset && !preferences().edit().remove(SettingsActivity.RESET).commit()) {
                notice(getString(R.string.save_failed));
            }
        }
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(longPress);
        centerDown = false;
        command("pauseAll");
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
            CookieManager.getInstance().flush();
        }
        resumed = false;
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        state.putString("site", siteUrl);
        if (webView != null) webView.saveState(state);
    }

    private void destroyBrowser() {
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        if (webView == null) return;
        browserContainer.removeView(webView);
        webView.stopLoading();
        webView.destroy();
        webView = null;
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_FILE || fileCallback == null) return;
        Uri selected = result == RESULT_OK && data != null ? data.getData() : null;
        if (selected != null && !"content".equals(selected.getScheme())) {
            notice(getString(R.string.invalid_file));
            selected = null;
        }
        fileCallback.onReceiveValue(selected == null ? null : new Uri[]{selected});
        fileCallback = null;
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (activeDialog != null) activeDialog.dismiss();
        hideFullscreen();
        destroyBrowser();
        super.onDestroy();
    }
}
