public final class NotificationDemo {
    private NotificationDemo() {
    }

    interface NotificationChannel {
        // 接口只描述所有通知渠道共同提供的能力，不规定邮件或短信的实现细节。
        String name();

        void send(String recipient, String message);
    }

    abstract static class ValidatingChannel implements NotificationChannel {
        @Override
        public final void send(String recipient, String message) {
            // 公共入口统一校验，具体子类只负责真正的投递动作。
            if (recipient == null || recipient.isBlank()) {
                throw new IllegalArgumentException("接收者不能为空。");
            }
            if (message == null || message.isBlank()) {
                throw new IllegalArgumentException("消息不能为空。");
            }
            // deliver 是动态分派点：实际对象决定运行 Email 还是 Sms 实现。
            deliver(recipient.trim(), message.trim());
        }

        protected abstract void deliver(String recipient, String message);
    }

    static final class EmailChannel extends ValidatingChannel {
        @Override
        public String name() {
            return "邮件";
        }

        @Override
        protected void deliver(String recipient, String message) {
            System.out.printf("[邮件] 发送给 %s：%s%n", recipient, message);
        }
    }

    static final class SmsChannel extends ValidatingChannel {
        @Override
        public String name() {
            return "短信";
        }

        @Override
        protected void deliver(String recipient, String message) {
            System.out.printf("[短信] 发送给 %s：%s%n", recipient, message);
        }
    }

    static final class NotificationService {
        // 字段的编译时类型是接口，因此 Service 不依赖某个具体渠道。
        private final NotificationChannel channel;

        NotificationService(NotificationChannel channel) {
            if (channel == null) {
                throw new IllegalArgumentException("通知渠道不能为空。");
            }
            this.channel = channel;
        }

        void notify(String recipient, String message) {
            System.out.println("使用渠道：" + channel.name());
            // 同一行代码可作用于 EmailChannel 或 SmsChannel，这就是本例需要的多态。
            channel.send(recipient, message);
        }
    }

    public static void main(String[] args) {
        if (args.length != 3) {
            System.err.println("用法：java NotificationDemo <email|sms> <接收者> <消息>");
            System.exit(2);
            return;
        }

        try {
            // 程序边界负责选择具体实现；选择完成后，后续业务只使用接口类型。
            NotificationChannel channel = switch (args[0]) {
                case "email" -> new EmailChannel();
                case "sms" -> new SmsChannel();
                default -> throw new IllegalArgumentException("渠道必须是 email 或 sms。");
            };
            NotificationService service = new NotificationService(channel);
            service.notify(args[1], args[2]);
        } catch (IllegalArgumentException error) {
            System.err.println("错误：" + error.getMessage());
            System.exit(2);
        }
    }
}
