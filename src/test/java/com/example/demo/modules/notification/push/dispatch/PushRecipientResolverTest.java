package com.example.demo.modules.notification.push.dispatch;

import com.example.demo.modules.auth.mapper.UserMapper;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipient;
import com.example.demo.modules.notification.push.recipient.NotifySourceRecipientService;
import com.example.demo.modules.personnel.service.PersonnelService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.lenient;

@ExtendWith(MockitoExtension.class)
class PushRecipientResolverTest {

    @Mock private NotifySourceRecipientService recipientService;
    @Mock private PersonnelService personnelService;
    @Mock private UserMapper userMapper;

    private PushRecipientResolver resolver;

    private static NotifySourceRecipient userScope(String value) {
        NotifySourceRecipient r = new NotifySourceRecipient();
        r.setSourceId(704L);
        r.setPerspective("ALL");
        r.setScopeType("USER");
        r.setScopeValue(value);
        return r;
    }

    private PushRecipientResolver newResolver() {
        return new PushRecipientResolver(recipientService, personnelService, userMapper);
    }

    @Test
    void 指定用户_原样进入结果() {
        resolver = newResolver();
        lenient().when(recipientService.listBySourceId(704L))
                .thenReturn(List.of(userScope("STAFF_a")));
        lenient().when(personnelService.resolveIdByAccount("STAFF_a")).thenReturn("4359");

        assertEquals(Set.of("STAFF_a"), resolver.resolve(704L, null));
    }

    /** 双 id：同一个人的 staff_id 与 aro_user_id 都配进来，只能发一次。 */
    @Test
    void 同人双账号_归并成一条() {
        resolver = newResolver();
        lenient().when(recipientService.listBySourceId(704L))
                .thenReturn(List.of(userScope("STAFF_a"), userScope("1935162605895184385")));
        lenient().when(personnelService.resolveIdByAccount("STAFF_a")).thenReturn("4359");
        lenient().when(personnelService.resolveIdByAccount("1935162605895184385")).thenReturn("4359");

        Set<String> out = resolver.resolve(704L, null);
        assertEquals(1, out.size());
        assertEquals(Set.of("STAFF_a"), out);
    }

    /** 没有人员档案的落单账号要保留，不能因为查不到 personnel 就被丢掉。 */
    @Test
    void 落单账号保留() {
        resolver = newResolver();
        lenient().when(recipientService.listBySourceId(704L))
                .thenReturn(List.of(userScope("orphan_x")));
        lenient().when(personnelService.resolveIdByAccount("orphan_x")).thenReturn(null);

        assertEquals(Set.of("orphan_x"), resolver.resolve(704L, null));
    }

    @Test
    void 动态接收人与配置接收人合并() {
        resolver = newResolver();
        lenient().when(recipientService.listBySourceId(704L))
                .thenReturn(List.of(userScope("STAFF_a")));
        lenient().when(personnelService.resolveIdByAccount("STAFF_a")).thenReturn("4359");
        lenient().when(personnelService.resolveIdByAccount("STAFF_b")).thenReturn("2677");

        Set<String> out = resolver.resolve(704L, Set.of("STAFF_b"));
        assertEquals(Set.of("STAFF_a", "STAFF_b"), out);
    }

    @Test
    void 没有接收人_返回空集() {
        resolver = newResolver();
        lenient().when(recipientService.listBySourceId(704L)).thenReturn(List.of());

        assertEquals(Set.of(), resolver.resolve(704L, null));
    }
}
