import { FeishuChannelCard } from './FeishuChannelCard';
import { TelegramChannelCard } from './TelegramChannelCard';
import { QQChannelCard } from './QQChannelCard';
import { WeChatChannelCard } from './WeChatChannelCard';
import { DingTalkChannelCard } from './DingTalkChannelCard';
import { DiscordChannelCard } from './DiscordChannelCard';
import { WhatsAppChannelCard } from './WhatsAppChannelCard';

export function UserChannelsSection() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
        绑定你的 IM 账号，消息将默认发送到默认 Agent 的主会话。
      </p>
      <FeishuChannelCard />
      <TelegramChannelCard />
      <QQChannelCard />
      <WeChatChannelCard />
      <DingTalkChannelCard />
      <DiscordChannelCard />
      <WhatsAppChannelCard />
    </div>
  );
}
