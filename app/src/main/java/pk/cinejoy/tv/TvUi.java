package pk.cinejoy.tv;

import android.content.Context;
import android.graphics.Color;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

final class TvUi {
    private TvUi() {}

    static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    static TextView text(Context context, CharSequence text, int size) {
        TextView view = new TextView(context);
        view.setText(text);
        view.setTextColor(Color.rgb(233, 238, 247));
        view.setTextSize(size);
        view.setPadding(0, dp(context, 6), 0, dp(context, 10));
        return view;
    }

    static Button button(Context context, int label, View.OnClickListener listener) {
        Button button = new Button(context);
        button.setId(View.generateViewId());
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(16);
        button.setAllCaps(false);
        button.setMinHeight(dp(context, 48));
        button.setMinimumWidth(dp(context, 88));
        button.setPadding(dp(context, 16), dp(context, 4), dp(context, 16), dp(context, 4));
        button.setBackgroundResource(R.drawable.tv_button);
        button.setOnClickListener(listener);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, dp(context, 48));
        params.setMargins(dp(context, 4), dp(context, 4), dp(context, 4), dp(context, 4));
        button.setLayoutParams(params);
        return button;
    }
}
