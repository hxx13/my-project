package com.example.demo.modules.twin.support;

/**
 * 冻结跑批执行期间的线程上下文：由 {@link com.example.demo.modules.twin.service.JobSchedulerService}
 * 在调用 {@link com.example.demo.modules.twin.service.JobExecutionRegistry#execute} 前后设置/清理，
 * 供 {@link com.example.demo.modules.twin.service.TwinCardMappingService#executeFreezeReaperTask} 写单人审计日志。
 */
public final class FreezeReaperAuditContext {

    private static final ThreadLocal<Ctx> TL = new ThreadLocal<>();

    private FreezeReaperAuditContext() {
    }

    public static void begin(String triggerType, String updatedBy, String jobKey) {
        Ctx c = new Ctx();
        c.triggerType = triggerType != null ? triggerType : "TIMER";
        c.updatedBy = updatedBy != null ? updatedBy : "";
        c.jobKey = jobKey != null ? jobKey : "";
        TL.set(c);
    }

    public static void end() {
        TL.remove();
    }

    public static Ctx get() {
        return TL.get();
    }

    public static final class Ctx {
        private String triggerType;
        private String updatedBy;
        private String jobKey;

        public String getTriggerType() {
            return triggerType;
        }

        public String getUpdatedBy() {
            return updatedBy;
        }

        public String getJobKey() {
            return jobKey;
        }
    }
}
