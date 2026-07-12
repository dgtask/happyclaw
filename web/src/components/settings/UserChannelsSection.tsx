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
        接入你的 IM 账号或 Bot；接入后可在工作区中绑定具体群聊和会话。
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
