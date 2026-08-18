import { Link } from 'react-router';
import { ArrowLeft, Shield, AlertTriangle, Link2, ExternalLink, Phone, Lock, UserCheck, Eye } from 'lucide-react';

const VERIFY_LINKS = [
  {
    title: '个人征信报告',
    desc: '中国人民银行征信中心，可查询本人信用报告。',
    url: 'https://ipcrs.pbccrc.org.cn/',
    tag: '征信',
  },
  {
    title: '失信被执行人查询',
    desc: '中国执行信息公开网，可查“老赖”、被执行记录。',
    url: 'http://zxgk.court.gov.cn/',
    tag: '执行',
  },
  {
    title: '裁判文书公开',
    desc: '中国裁判文书网，可查涉诉、刑事/民事判决记录。',
    url: 'https://wenshu.court.gov.cn/',
    tag: '文书',
  },
  {
    title: '婚姻登记信息',
    desc: '国家政务服务平台，部分地区可预约/查询婚姻登记记录。',
    url: 'https://www.gjzwfw.gov.cn/',
    tag: '婚姻',
  },
  {
    title: '婚姻登记网上预约',
    desc: '民政部婚姻登记预约服务平台。',
    url: 'https://hygl.mca.gov.cn/',
    tag: '婚姻',
  },
  {
    title: '艾滋病防治与检测',
    desc: '中国疾控中心性病艾滋病预防控制中心，提供检测知识与机构信息。',
    url: 'http://www.chinaids.org.cn/',
    tag: '健康',
  },
  {
    title: '国家卫生健康委员会',
    desc: '卫生健康政策与医疗机构信息查询入口。',
    url: 'http://www.nhc.gov.cn/',
    tag: '健康',
  },
  {
    title: '企业信用信息公示',
    desc: '国家市场监督管理总局，可查公司/个体户注册及经营异常。',
    url: 'https://www.gsxt.gov.cn/index.html',
    tag: '企业',
  },
  {
    title: '社会组织信用信息',
    desc: '民政部社会组织公示平台，可查协会、基金会等登记信息。',
    url: 'https://xxgs.chinanpo.msdgn.cn/',
    tag: '社会组织',
  },
  {
    title: '学历/学籍查询',
    desc: '中国高等教育学生信息网（学信网）。',
    url: 'https://www.chsi.com.cn/',
    tag: '学历',
  },
  {
    title: '职业资格证书查询',
    desc: '技能人才评价证书全国联网查询。',
    url: 'http://zscx.osta.org.cn/',
    tag: '职业资格',
  },
  {
    title: '网站/APP备案查询',
    desc: '工信部 ICP/IP/域名备案系统，可查平台是否正规备案。',
    url: 'https://beian.miit.gov.cn/',
    tag: '备案',
  },
  {
    title: '公安部政务服务平台',
    desc: '可在线申请“无犯罪记录证明”等政务服务。',
    url: 'https://zwfw.mps.gov.cn/',
    tag: '政务',
  },
  {
    title: '个人所得税/自然人电子税务局',
    desc: '国家税务总局，可查询个税申报、收入纳税记录。',
    url: 'https://etax.chinatax.gov.cn/',
    tag: '税务',
  },
  {
    title: '国家药品监督管理局',
    desc: '药品、医疗器械、化妆品注册与备案查询。',
    url: 'https://www.nmpa.gov.cn/',
    tag: '药品',
  },
  {
    title: '国家知识产权局',
    desc: '专利、商标等知识产权查询。',
    url: 'https://www.cnipa.gov.cn/',
    tag: '知产',
  },
  {
    title: '组织机构代码查询',
    desc: '全国组织机构统一社会信用代码公示查询平台。',
    url: 'https://www.cods.org.cn/',
    tag: '机构',
  },
  {
    title: '网络不良信息举报',
    desc: '12321 网络不良与垃圾信息举报受理中心。',
    url: 'https://www.12321.cn/',
    tag: '举报',
  },
  {
    title: '庭审公开网',
    desc: '中国庭审公开网，可观看公开庭审直播/回放。',
    url: 'https://tingshen.court.gov.cn/',
    tag: '庭审',
  },
];

const TIPS = [
  { icon: UserCheck, title: '先核实身份', text: '见面或深入交往前，尽量通过官方渠道核实学历、职业、征信、涉诉、婚姻等关键信息。' },
  { icon: Lock, title: '保护隐私', text: '不要轻易透露身份证号、银行卡、家庭住址、验证码等敏感信息。' },
  { icon: Phone, title: '谨慎转账', text: '任何理由的借钱、投资、刷单、代付都可能是诈骗，转账前务必多方核实。' },
  { icon: Eye, title: '实地见面', text: '初次见面选择公共场所，告知亲友行程，避免前往偏僻或私密场所。' },
  { icon: Shield, title: '关注健康', text: '正式交往前建议共同进行健康体检，艾滋病等传染病检测可前往正规医院或疾控中心。' },
];

export default function AntiFraudPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-main)' }}>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/" className="p-2 rounded-lg hover-warm" style={{ color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <Shield size={16} style={{ color: 'var(--color-success)' }} />
          <h1 className="text-lg font-medium" style={{ color: 'var(--color-text-primary)' }}>防诈安全中心</h1>
        </div>

        <div className="rounded-xl p-4 mb-4" style={{ background: 'linear-gradient(135deg, rgba(var(--color-primary-rgb), 0.08), var(--color-bg-card))', border: '1px solid var(--color-bg-warm)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={15} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>温馨提示</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            本平台不保留站内私信功能。交换联系方式后，请务必通过下方官方渠道交叉核实对方关键信息，谨防诈骗。
          </p>
        </div>

        <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={15} style={{ color: 'var(--color-success)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-success)' }}>防诈守则</span>
          </div>
          <div className="space-y-3">
            {TIPS.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(var(--color-success-rgb), 0.08)' }}>
                  <tip.icon size={14} style={{ color: 'var(--color-success)' }} />
                </div>
                <div>
                  <div className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{tip.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{tip.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-3.5 mb-4" style={{ background: 'rgba(212,160,84,0.04)', border: '1px solid rgba(212,160,84,0.15)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            注：我国目前暂无面向普通公众的“他人婚姻状态”“个人犯罪记录”“传染病检查结果”等公开查询网站。相关核实需通过官方政务服务申请、正规医院检测或司法机关渠道进行。
          </p>
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={15} style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-primary)' }}>官方信息核实工具</span>
          </div>
          <div className="space-y-2.5">
            {VERIFY_LINKS.map((item, idx) => (
              <a
                key={idx}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-xl transition-all hover:translate-y-[-1px]"
                style={{ background: '#fff', border: '1px solid rgba(var(--color-border-warm-rgb), 0.6)' }}
              >
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(var(--color-primary-rgb), 0.08)', color: 'var(--color-primary)' }}>{item.tag}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-light)' }}>{item.desc}</p>
                </div>
                <ExternalLink size={14} style={{ color: 'var(--color-text-secondary)' }} />
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(var(--color-danger-rgb), 0.03)', border: '1px solid var(--color-bg-pink)' }}>
          <div className="flex items-center gap-2 mb-2">
            <Phone size={15} style={{ color: 'var(--color-danger)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--color-danger)' }}>如遇诈骗</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            请立即停止联系并保存证据，拨打 110 或 96110 反诈专线报警，也可通过上方“网络不良信息举报”入口提交举报。
          </p>
        </div>
      </div>
    </div>
  );
}
