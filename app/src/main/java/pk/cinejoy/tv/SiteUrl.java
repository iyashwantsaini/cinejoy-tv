package pk.cinejoy.tv;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Validates the user-selected site without trusting page-controlled URLs. */
public final class SiteUrl {
    public static final String DEFAULT = "https://cinejoy.pk/";

    private SiteUrl() {}

    public static String normalize(String input) {
        if (input == null || input.trim().isEmpty()) {
            throw new IllegalArgumentException("Enter a website address.");
        }
        String value = input.trim();
        if (value.length() > 2048 || value.matches(".*[\\s\\\\].*")) {
            throw new IllegalArgumentException("The address is too long or contains spaces or backslashes.");
        }
        if (!value.contains("://")) {
            value = "https://" + value;
        }
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                throw new IllegalArgumentException("Use an HTTPS address for a secure connection.");
            }
            String host = uri.getHost();
            if (host == null || host.isEmpty() || uri.getRawUserInfo() != null) {
                throw new IllegalArgumentException("Enter a valid hostname without a username or password.");
            }
            if (uri.getPort() == 0 || uri.getPort() > 65535 || uri.getRawAuthority().endsWith(":")) {
                throw new IllegalArgumentException("The address has an invalid port.");
            }
            String authority = host.toLowerCase(Locale.ROOT);
            if (uri.getPort() != -1 && uri.getPort() != 443) {
                authority += ":" + uri.getPort();
            }
            String path = uri.getRawPath();
            String result = "https://" + authority + (path == null || path.isEmpty() ? "/" : path);
            if (uri.getRawQuery() != null) result += "?" + uri.getRawQuery();
            if (uri.getRawFragment() != null) result += "#" + uri.getRawFragment();
            return new URI(result).toASCIIString();
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("Enter a valid HTTPS website address.", e);
        }
    }

    public static String origin(String address) {
        URI uri = URI.create(normalize(address));
        return "https://" + uri.getRawAuthority();
    }

    public static boolean isSameOrigin(String base, String candidate) {
        if (candidate == null || !candidate.toLowerCase(Locale.ROOT).startsWith("https://")) {
            return false;
        }
        try {
            return origin(base).equals(origin(candidate));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
