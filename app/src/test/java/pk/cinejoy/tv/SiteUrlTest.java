package pk.cinejoy.tv;

import org.junit.Test;
import static org.junit.Assert.*;

public class SiteUrlTest {
    @Test public void acceptsDomainAndCanonicalizesOrigin() {
        assertEquals("https://cinejoy.pk/", SiteUrl.normalize(" Cinejoy.PK "));
        assertEquals("https://example.com/", SiteUrl.normalize("HTTPS://EXAMPLE.COM:443"));
        assertEquals("https://example.com:8443/base?q=a%20b#start",
                SiteUrl.normalize("https://example.com:8443/base?q=a%20b#start"));
        assertEquals("https://example.com/a%2Fb", SiteUrl.normalize("example.com/a%2Fb"));
    }

    @Test public void changingDomainDoesNotDependOnOriginalHost() {
        assertEquals("https://new.example/", SiteUrl.normalize("new.example"));
        assertTrue(SiteUrl.isSameOrigin("https://new.example/", "https://NEW.example:443/watch/1"));
        assertFalse(SiteUrl.isSameOrigin("https://new.example/", "https://new.example.evil.test/"));
        assertFalse(SiteUrl.isSameOrigin("https://new.example/", "https://other.example/"));
        assertFalse(SiteUrl.isSameOrigin("https://new.example/", "https://new.example:8443/"));
        assertFalse(SiteUrl.isSameOrigin("https://new.example/", "http://new.example/"));
        assertFalse(SiteUrl.isSameOrigin("https://new.example/", "new.example"));
        assertFalse(SiteUrl.isSameOrigin("https://new.example/", null));
    }

    @Test public void rejectsUnsafeOrMalformedAddresses() {
        String[] invalid = {"", " ", "http://example.com", "file:///tmp/a", "javascript:alert(1)",
                "https://user:pass@example.com", "https://", "https://exa mple.com",
                "https://example.com\\@evil.test", "https://example.com:65536/",
                "https://example.com:0/", "https://example.com:/", "https://example.com:-2",
                "https://example.com/\nspoof", "https://example.com/%zz"};
        for (String value : invalid) {
            assertThrows(value, IllegalArgumentException.class, () -> SiteUrl.normalize(value));
        }
        assertThrows(IllegalArgumentException.class, () -> SiteUrl.normalize(null));
        assertThrows(IllegalArgumentException.class, () -> SiteUrl.normalize("x".repeat(2049)));
    }
}
