package pk.cinejoy.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Toast;

import androidx.webkit.WebViewCompat;

public final class SettingsActivity extends Activity {
    static final String PREFS = "tv_settings";
    static final String URL = "site_url";
    static final String RESET = "reset_browser";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setFitsSystemWindows(true);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = TvUi.dp(this, 32);
        content.setPadding(padding, padding / 2, padding, padding);
        scroll.addView(content);
        content.addView(TvUi.text(this, getString(R.string.settings_title), 28));
        content.addView(TvUi.text(this, getString(R.string.settings_description), 18));
        content.addView(TvUi.text(this, getString(R.string.url_label), 16));

        EditText address = new EditText(this);
        address.setId(View.generateViewId());
        address.setSingleLine(true);
        address.setTextSize(20);
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setSelectAllOnFocus(true);
        address.setHint(R.string.url_hint);
        address.setText(preferences.getString(URL, SiteUrl.DEFAULT));
        content.addView(address, new LinearLayout.LayoutParams(-1, TvUi.dp(this, 58)));

        LinearLayout actions = new LinearLayout(this);
        actions.addView(TvUi.button(this, R.string.save_url, v -> {
            final String normalized;
            try {
                normalized = SiteUrl.normalize(address.getText().toString());
            } catch (IllegalArgumentException e) {
                address.setError(e.getMessage());
                address.requestFocus();
                return;
            }
            if (!preferences.edit().putString(URL, normalized).commit()) {
                Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
                return;
            }
            finish();
        }));
        actions.addView(TvUi.button(this, R.string.cancel, v -> finish()));
        actions.addView(TvUi.button(this, R.string.default_url, v -> {
            address.setText(SiteUrl.DEFAULT);
            address.requestFocus();
        }));
        content.addView(actions);
        content.addView(TvUi.button(this, R.string.reset_data, v ->
                new AlertDialog.Builder(this)
                        .setTitle(R.string.reset_title)
                        .setMessage(R.string.reset_message)
                        .setNegativeButton(R.string.cancel, null)
                        .setPositiveButton(R.string.reset_data, (dialog, which) -> {
                            if (WebViewCompat.getCurrentWebViewPackage(this) == null) {
                                Toast.makeText(this, R.string.webview_missing, Toast.LENGTH_LONG).show();
                                return;
                            }
                            if (!preferences.edit().putBoolean(RESET, true).commit()) {
                                Toast.makeText(this, R.string.reset_failed, Toast.LENGTH_LONG).show();
                                return;
                            }
                            WebStorage.getInstance().deleteAllData();
                            CookieManager.getInstance().removeAllCookies(removed -> {
                                CookieManager.getInstance().flush();
                                Toast.makeText(this, R.string.reset_done, Toast.LENGTH_LONG).show();
                                finish();
                            });
                        }).show()));
        content.addView(TvUi.text(this, getString(R.string.privacy_note), 16));
        setContentView(scroll);
        // Keep the keyboard closed until the user selects the address.
        actions.getChildAt(0).requestFocus();
    }
}
