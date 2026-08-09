import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
// 提供已构建的前端静态资源（生产模式 `npm start` 直接访问同一端口）
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/socket.io'))
        return next();
    res.sendFile(path.join(clientDist, 'index.html'), err => {
        if (err)
            next();
    });
});
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
// 做空保证金常量
const SHORT_INITIAL_MARGIN_RATE = 0.5; // 初始保证金 50% 名义价值
const SHORT_MAINTENANCE_RATE = 0.3; // 维持保证金 30% 名义价值
// 检查强制平仓（每日tick调用）
function checkMarginCall(room) {
    const marginCallMessages = [];
    room.players.forEach(player => {
        if (player.isBankrupt)
            return;
        player.stocks.forEach(holding => {
            if (holding.shortQuantity === 0)
                return;
            const stock = room.stocks.find(s => s.symbol === holding.symbol);
            if (!stock)
                return;
            const notional = stock.price * holding.shortQuantity;
            const initialMargin = holding.shortMarginFrozen || (notional * SHORT_INITIAL_MARGIN_RATE);
            const maintenanceMargin = notional * SHORT_MAINTENANCE_RATE;
            const unrealizedLoss = (holding.shortAvgCost - stock.price) * holding.shortQuantity;
            const availableMargin = initialMargin + unrealizedLoss;
            if (availableMargin < maintenanceMargin) {
                const quantity = holding.shortQuantity;
                const coverCost = stock.price * quantity;
                if (player.cash + player.deposit < coverCost) {
                    player.isBankrupt = true;
                    marginCallMessages.push(`${player.name} 无法补缴保证金，${stock.name} ${quantity}股 强制平仓失败，破产！`);
                }
                else {
                    deductFunds(player, coverCost, 'auto');
                    player.deposit += initialMargin;
                    const profit = (holding.shortAvgCost - stock.price) * quantity;
                    player.cash += profit;
                    marginCallMessages.push(`⚠️ ${player.name} ${stock.name} ${quantity}股 触发强制平仓！（维持保证金 $${Math.round(maintenanceMargin)}，剩余 $${Math.round(availableMargin)}）` +
                        (profit >= 0 ? `, 获利 $${Math.round(profit)}` : `, 亏损 $${Math.abs(Math.round(profit))}`));
                }
                holding.shortQuantity = 0;
                holding.shortAvgCost = 0;
                holding.shortMarginFrozen = 0;
                holding.shortCashReceived = 0;
            }
        });
    });
    if (marginCallMessages.length > 0) {
        marginCallMessages.forEach(m => sendMessage(room, 'warning', m));
    }
}
// ============ Constants ============
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
const INITIAL_CASH = 50000;
const INITIAL_DEPOSIT = 50000;
const INITIAL_DIAMONDS = 100;
const START_BONUS = 1000;
const SINGLEPLAYER_TARGET = 100_000_000; // 1亿
// 升级材料消耗
const UPGRADE_MATERIAL_COST = {
    1: { cement: 5, steel: 3, rubber: 1 }, // 1->2 房屋
    2: { cement: 10, steel: 6, rubber: 2 }, // 2->3 大厦
    3: { cement: 20, steel: 12, rubber: 4 }, // 3->4 顶级
    // 顶级之后选择特殊升级
};
const SPECIAL_UPGRADE_COST = {
    hotel: { cement: 30, steel: 20, rubber: 5, preciousMetals: 0, cash: 5000, attraction: 0 },
    smelter: { cement: 25, steel: 30, rubber: 5, preciousMetals: 10, cash: 8000, attraction: 0 },
    diamondMine: { cement: 20, steel: 40, rubber: 8, preciousMetals: 0, cash: 15000, attraction: 0 },
    agency: { cement: 15, steel: 10, rubber: 3, preciousMetals: 5, cash: 12000, attraction: 0 },
    resort: { cement: 25, steel: 15, rubber: 10, preciousMetals: 0, cash: 10000, attraction: 20 },
    mall: { cement: 30, steel: 25, rubber: 8, preciousMetals: 5, cash: 12000, attraction: 15 },
    monument: { cement: 40, steel: 30, rubber: 15, preciousMetals: 10, cash: 20000, attraction: 30 }
};
// 特殊升级每回合收益
const SPECIAL_UPGRADE_INCOME = {
    hotel: { depositInterest: 0.05, description: '每回合按存款5%获得利息' },
    smelter: { preciousMetalsPerTurn: 1, description: '每回合获得1贵金属' },
    diamondMine: { diamondsPerTurn: 2, description: '每回合获得2钻石' },
    agency: { tollMultiplier: 2, description: '所有房产过路费翻倍' },
    resort: { cashPerTurn: 1000, description: '每回合获得 $1000 现金' },
    mall: { cashPerTurn: 500, diamondsPerTurn: 1, description: '每回合获得 $500 现金 + 1 💎' },
    monument: { attractionPerTurn: 5, description: '每回合获得 5 吸引力（地标建筑）' }
};
// 贷款利率和期限
const LOAN_INTEREST_RATE = 0.05; // 月利率 5%（每30天5%）
const LOAN_TURNS_UNTIL_DUE = 30; // 30天后到期
const LOAN_FEE_RATE = 0.02; // 2% 手续费
// 期货做空保证金规则
const FUTURES_INITIAL_MARGIN_RATE = 0.20; // 初始保证金：名义价值的20%
const FUTURES_MAINTENANCE_MARGIN_RATE = 0.15; // 维持保证金：当前名义价值的15%
const FUTURES_FEE_RATE = 0.02; // 开/平仓手续费
function todayString() {
    return new Date().toISOString().slice(0, 10);
}
function addDays(dateString, days) {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
// 资金扣款工具：先现金，再存款
function deductFunds(player, amount, source = 'auto') {
    if (amount <= 0)
        return true;
    if (source === 'cash') {
        if (player.cash < amount)
            return false;
        player.cash -= amount;
        return true;
    }
    if (source === 'deposit') {
        if (player.deposit < amount)
            return false;
        player.deposit -= amount;
        return true;
    }
    // auto: 先现金，不足补存款
    const totalAvail = player.cash + player.deposit;
    if (totalAvail < amount)
        return false;
    const fromCash = Math.min(player.cash, amount);
    player.cash -= fromCash;
    const remaining = amount - fromCash;
    if (remaining > 0) {
        player.deposit -= remaining;
    }
    return true;
}
function addFunds(player, amount, target = 'auto') {
    if (amount <= 0)
        return;
    if (target === 'cash') {
        player.cash += amount;
        return;
    }
    if (target === 'deposit') {
        player.deposit += amount;
        return;
    }
    player.deposit += amount;
}
const BANK_FEE_RATE = 0.01; // 1% 存款/取现手续费
const TOTAL_CELLS = 64;
// ============ Game State ============
const rooms = new Map();
const STOCK_NAMES = [
    { name: '科技', sector: 'TMT', stocks: ['腾讯控股', '阿里巴巴', '百度集团', '美团'] },
    { name: '金融', sector: '金融', stocks: ['中国平安', '招商银行', '中国太保', '中信证券'] },
    { name: '能源', sector: '能源', stocks: ['中国石油', '中国石化', '中国神华', '长江电力'] },
    { name: '医疗', sector: '消费', stocks: ['恒瑞医药', '迈瑞医疗', '药明康德', '爱尔眼科'] },
    { name: '消费', sector: '消费', stocks: ['贵州茅台', '五粮液', '美的集团', '比亚迪'] },
    { name: '工业', sector: '周期', stocks: ['中国中车', '三一重工', '宝钢股份', '海螺水泥'] },
    { name: '地产', sector: '周期', stocks: ['万科A', '保利发展', '中国建筑', '中国中铁'] },
    { name: '农业', sector: '农业', stocks: ['隆平高科', '登海种业', '北大荒', '新希望'] },
    { name: '军工', sector: '防务', stocks: ['中国船舶', '中航沈飞', '航发动力', '中航光电'] },
    { name: '教育', sector: 'TMT', stocks: ['新东方', '好未来', '中公教育', '学而思'] },
    { name: '娱乐', sector: '消费', stocks: ['哔哩哔哩', '网易', '万达电影', '宋城演艺'] },
    { name: '交通', sector: '基建', stocks: ['中国国航', '南方航空', '中远海控', '京沪高铁'] },
    { name: '物流', sector: '基建', stocks: ['顺丰控股', '京东物流', '圆通速递', '中通快递'] },
    { name: '材料', sector: '周期', stocks: ['紫金矿业', '洛阳钼业', '赣锋锂业', '天齐锂业'] },
    { name: '环保', sector: '基建', stocks: ['碧水源', '伟明环保', '瀚蓝环境', '上海环境'] }
];
const FUTURES_NAMES = [
    // 贵金属（投资/冶炼场升级）
    { name: '黄金期货', type: 'gold', category: 'precious', isMaterial: false },
    { name: '白银期货', type: 'silver', category: 'precious', isMaterial: false },
    { name: '钻石期货', type: 'diamond', category: 'precious', isMaterial: false },
    // 建材（升级房屋）
    { name: '水泥期货', type: 'cement', category: 'material', isMaterial: true },
    { name: '钢材期货', type: 'steel', category: 'material', isMaterial: true },
    { name: '橡胶期货', type: 'rubber', category: 'material', isMaterial: true },
    // 能源（多元化）
    { name: '原油期货', type: 'oil', category: 'energy', isMaterial: false },
    // 农产品（多元化）
    { name: '小麦期货', type: 'wheat', category: 'agriculture', isMaterial: false }
];
const STOCK_NEWS = {
    good: [
        '📰 公司业绩大幅增长，季度利润超预期',
        '📰 获得重大政府合同，市场份额扩大',
        '📰 成功研发新技术，产品供不应求',
        '📰 行业景气度上升，订单量激增',
        '📰 并购重组完成，估值大幅提升',
        '📰 出口业务增长，汇率收益可观',
        '📰 获得国际认证，打开全球市场',
        '📰 降本增效显著，利润率提升'
    ],
    bad: [
        '📰 遭遇反垄断调查，股价承压',
        '📰 产品质量问题，召回产品损失惨重',
        '📰 行业产能过剩，竞争加剧',
        '📰 原材料价格上涨，成本压力增大',
        '📰 高管变动频繁，投资者担忧',
        '📰 环保违规被处罚，整改成本高',
        '📰 海外市场遇阻，出口下滑',
        '📰 库存积压，资金周转困难'
    ]
};
const AI_NAMES_EASY = ['小李', '阿强', '小王'];
const AI_NAMES_NORMAL = ['陈总', 'Lisa', 'Mark'];
const AI_NAMES_HARD = ['金融大鳄', '巴菲特', '索罗斯'];
// ============ Generate 64-cell square board ============
// 方形布局：顶排(0-15) → 右列(16-31) → 底排(32-47) → 左列(48-63)
// 起点在左上角(0)，顺时针
function generateCells() {
    // 特殊格位置（64格方形）
    // 起点: 0
    // 银行: 5 (顶排中部)
    // 股票交易所: 16 (右列起点 - 右上角)
    // 期货交易所: 48 (左列起点 - 左下角)
    // 钻石: 10, 21, 36, 52
    // 机会: 3, 7, 11, 18, 23, 27, 33, 38, 42, 46, 53, 58
    // 命运: 15, 25, 39, 55
    const special = {};
    const cellTypes = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
        let type = 'empty';
        if (i === 0)
            type = 'start';
        else if (i === 5)
            type = 'bank';
        else if (i === 16)
            type = 'stock';
        else if (i === 48)
            type = 'futures';
        else if (i === 32)
            type = 'realestate';
        else if ([10, 21, 36, 52].includes(i))
            type = 'diamond';
        else if ([3, 7, 11, 18, 23, 27, 33, 38, 42, 46, 53, 58].includes(i))
            type = 'chance';
        else if ([15, 25, 39, 55].includes(i))
            type = 'destiny';
        cellTypes.push(type);
    }
    return cellTypes.map((type, i) => {
        let name = '';
        let basePrice = 0;
        let price = 0;
        switch (type) {
            case 'start':
                name = '🚩起点';
                break;
            case 'bank':
                name = '🏦平安银行';
                break;
            case 'stock':
                name = '📈股票交易所';
                break;
            case 'futures':
                name = '🛢️期货交易所';
                break;
            case 'realestate':
                name = '🏛️房地产交易中心';
                break;
            case 'chance':
                name = '❓机会';
                break;
            case 'destiny':
                name = '🎯命运';
                break;
            case 'diamond':
                name = '💎钻石';
                break;
            case 'empty': {
                const regionNames = [
                    '朝阳', '海淀', '丰台', '石景山', '西城', '东城', '崇文', '宣武', '昌平', '大兴',
                    '通州', '顺义', '怀柔', '密云', '平谷', '延庆', '门头沟', '房山', '燕山', '黄村',
                    '滨海', '河东', '河西', '南开', '河北', '红桥', '东丽', '西青', '津南', '北辰',
                    '武清', '静海', '宝坻', '宁河', '蓟县', '长安', '桥西', '新华', '裕华', '井陉',
                    '浦东', '黄浦', '徐汇', '长宁', '静安', '普陀', '虹口', '杨浦', '闵行', '宝山',
                    '嘉定', '金山', '松江', '青浦', '奉贤', '崇明', '西湖', '滨江', '上城', '下城',
                    '拱墅', '江干', '余杭', '萧山', '富阳', '临安'
                ];
                name = regionNames[i] || `地块${i}`;
                // 价位：顶排和右列较贵
                if (i >= 32 && i <= 47)
                    basePrice = Math.floor(Math.random() * 800) + 600;
                else if (i >= 48 && i <= 63)
                    basePrice = Math.floor(Math.random() * 1000) + 700;
                else
                    basePrice = Math.floor(Math.random() * 1500) + 1000;
                price = basePrice;
                break;
            }
        }
        return { id: i, type, name, price, owner: null, level: 0, basePrice };
    });
}
const OPERATOR_PLAN = {
    target: 0,
    stage: 1,
    daysLeft: 5
};
// ============ 随机函数 ============
function rand(min, max) {
    return min + Math.random() * (max - min);
}
function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}
function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
}
// 投资者权重 (与 share 1.2.2 保持一致)
const RETAIL_WEIGHT = 2000 * 0.8;
const BIG_WEIGHT = 500 * 4.5;
const HOT_WEIGHT = 50 * 10.0;
const QUANT_WEIGHT = 5 * 16.0;
const OPERATOR_WEIGHT = 1 * 220.0;
// ============ 投资者情绪模拟 ============
function simulateMarketDay(stocks) {
    // 1) 横盘倒计时 / 操盘手过期
    for (const s of stocks) {
        if (s.consolidateDays > 0) {
            s.consolidateDays--;
            if (s.consolidateDays === 0) {
                s.isConsolidating = false;
            }
        }
        if (s.noManipulatorDays > 0) {
            s.noManipulatorDays--;
            s.isNoManipulator = true;
        }
        else {
            s.isNoManipulator = false;
        }
        // 2) 事件倒计时 / 创建新事件
        if (s.eventDays > 0) {
            s.eventDays--;
            if (s.eventDays === 0) {
                s.eventEffect = 1.0;
                s.eventDesc = '无重大事件';
            }
        }
        else {
            // 15% 概率触发新事件
            if (Math.random() < 0.15) {
                const r = randInt(0, 4);
                switch (r) {
                    case 0:
                        s.eventEffect = 1.22;
                        s.eventDesc = '签订大额合同';
                        s.eventDays = randInt(7, 12);
                        break;
                    case 1:
                        s.eventEffect = 0.82;
                        s.eventDesc = '产品召回危机';
                        s.eventDays = randInt(5, 10);
                        break;
                    case 2:
                        s.eventEffect = 1.15;
                        s.eventDesc = '政策扶持利好';
                        s.eventDays = randInt(6, 14);
                        break;
                    case 3:
                        s.eventEffect = 0.78;
                        s.eventDesc = '管理层变动传闻';
                        s.eventDays = randInt(5, 11);
                        break;
                    case 4:
                        s.eventEffect = 1.30;
                        s.eventDesc = '核心技术突破';
                        s.eventDays = randInt(4, 8);
                        break;
                }
            }
        }
    }
    // 3) 操盘手阶段推进
    OPERATOR_PLAN.daysLeft--;
    if (OPERATOR_PLAN.daysLeft <= 0) {
        OPERATOR_PLAN.stage++;
        if (OPERATOR_PLAN.stage > 4) {
            OPERATOR_PLAN.target = randInt(0, stocks.length - 1);
            OPERATOR_PLAN.stage = 1;
            OPERATOR_PLAN.daysLeft = randInt(4, 8);
        }
        else {
            OPERATOR_PLAN.daysLeft = randInt(3, 6);
        }
    }
    // 4) 计算每日收益率
    for (let i = 0; i < stocks.length; i++) {
        const s = stocks[i];
        const lastClose = s.history.length > 0 ? s.history[s.history.length - 1].close : s.price;
        const prevClose = s.history.length > 1 ? s.history[s.history.length - 2].close : lastClose;
        const momentum = prevClose > 0 ? (lastClose - prevClose) / prevClose : 0;
        const ma5 = movingAverage(s, 5);
        const ma10 = movingAverage(s, 10);
        const fundamentalSignal = (s.base * s.eventEffect - lastClose) / Math.max(lastClose, 1);
        // ============ 散户 / 机构 / 游资 / 量化4 类参与者信号 ============
        // 红心/黑心卡牌效果 cardBias（-1 ~ +1）只影响这 4 类参与者，不影响操盘手
        // cardBias > 0 → 整体看多倾向；cardBias < 0 → 整体看空倾向
        const cb = s.cardBias || 0;
        // 概率倾斜强度：cardBias × 0.35（最大约 ±35%）
        const cbStrength = cb * 0.35;
        // 散户：跟趋势 + 大幅噪声（被卡片影响：噪声分布向偏向方向倾斜）
        const retailNoise = rand(-0.23, 0.23);
        const retailBiasNoise = cb >= 0
            ? Math.abs(retailNoise) * (cb > 0 ? 1 : 0) // 红心：负噪声翻为正
            : -Math.abs(retailNoise) * (cb < 0 ? 1 : 0); // 黑心：正噪声翻为负
        const retailSentiment = clamp(momentum * 0.4 + retailBiasNoise + cbStrength, -1, 1);
        // 机构：均衡 + 注重基本面（卡片影响：整体信号 × (1 + cb × 0.4)）
        const bigRaw = 0.35 * momentum + 0.35 * fundamentalSignal + rand(-0.30, 0.30);
        const bigSentiment = clamp(bigRaw * (1 + cb * 0.4) + cbStrength, -1, 1);
        // 游资：基本面为主（卡片影响：基本面系数从 0.60 → 0.60 × (1 + cb × 0.4)）
        const hotRaw = 0.20 * momentum + (0.60 * (1 + cb * 0.4)) * fundamentalSignal + rand(-0.12, 0.12);
        const hotSentiment = clamp(hotRaw + cbStrength * 0.5, -1, 1);
        // 量化：均线交叉（卡片影响：顺势信号放大、逆势信号衰减）
        let quantStrength = clamp(1 + rand(-0.22, 0.22), 0.5, 1.2);
        if (ma5 > ma10) {
            // 已经在上升趋势：红心 → 放大；黑心 → 衰减
            quantStrength *= (1 + cb * 0.5);
        }
        else if (ma5 < ma10) {
            // 在下降趋势：黑心 → 放大；红心 → 衰减
            quantStrength *= (1 - cb * 0.5);
        }
        const quantSentiment = (ma5 > ma10 ? 1 : -1) * clamp(quantStrength, 0.3, 1.5);
        // 操盘手：四阶段策略（❌ 不受 cardBias 影响）
        let operatorSentiment = 0;
        if (!s.isNoManipulator && i === OPERATOR_PLAN.target) {
            switch (OPERATOR_PLAN.stage) {
                case 1:
                    operatorSentiment = 0.9 + rand(-0.1, 0.1);
                    break; // 吸筹
                case 2:
                    operatorSentiment = rand(-0.35, 0.35);
                    break; // 洗盘
                case 3:
                    operatorSentiment = 1.2 + rand(-0.15, 0.15);
                    break; // 拉升
                case 4:
                    operatorSentiment = -1.3 + rand(-0.18, 0.18);
                    break; // 出货
            }
        }
        const netFlow = RETAIL_WEIGHT * retailSentiment
            + BIG_WEIGHT * bigSentiment
            + HOT_WEIGHT * hotSentiment
            + QUANT_WEIGHT * quantSentiment
            + OPERATOR_WEIGHT * operatorSentiment;
        const pressure = netFlow / 20000;
        const eventBias = (s.eventEffect - 1.0) * 0.12;
        const meanReversion = (s.base * s.eventEffect - lastClose) / lastClose * 0.08;
        const noise = rand(-0.035, 0.035);
        let dailyReturn = clamp(pressure * 0.5 + meanReversion + eventBias + noise, -0.25, 0.25);
        // 横盘期：限制波动 + 强均值回归
        if (s.isConsolidating && !s.isNoManipulator) {
            dailyReturn = clamp(dailyReturn, -0.008, 0.008);
            dailyReturn += (s.base * s.eventEffect - lastClose) / lastClose * 0.08;
        }
        // 主力护盘：均线反向洗盘
        if (!s.isNoManipulator) {
            const ma5Cur = movingAverage(s, 5);
            const ma10Cur = movingAverage(s, 10);
            if (ma5Cur > ma10Cur) {
                if (Math.random() < 0.20)
                    dailyReturn -= rand(0.02, 0.05);
            }
            else if (ma5Cur < ma10Cur) {
                if (Math.random() < 0.20)
                    dailyReturn += rand(0.02, 0.05);
            }
        }
        // 反操盘：连续上涨后冻结
        if (s.isNoManipulator) {
            dailyReturn = clamp(dailyReturn, -0.01, 0.01);
            const strongMeanReversion = (s.base * s.eventEffect - lastClose) / lastClose * 0.15;
            dailyReturn = clamp(dailyReturn + strongMeanReversion, -0.01, 0.01);
        }
        dailyReturn = clamp(dailyReturn, -0.25, 0.25);
        let newPrice = lastClose * Math.exp(dailyReturn);
        newPrice = Math.max(0.05, newPrice);
        newPrice = Math.round(newPrice * 100) / 100;
        // 涨幅过大进入反操盘期
        const recentChange = lastClose > 0 && s.history.length >= 2
            ? Math.abs((lastClose - s.history[s.history.length - 2].close) / s.history[s.history.length - 2].close)
            : 0;
        if (recentChange > 0.05 && Math.random() < 0.3) {
            s.isConsolidating = true;
            s.consolidateDays = randInt(5, 15);
        }
        // 计算OHLC
        const open = lastClose;
        const range = Math.max(0.01, Math.abs(newPrice - open));
        const extra = Math.max(0.01, range * (0.08 + Math.random() * 0.12));
        const high = Math.max(open, newPrice) + extra;
        const low = Math.max(0.01, Math.min(open, newPrice) - extra);
        // 成交量
        const absReturn = Math.abs(dailyReturn);
        let volumeBase = 20000 + 80000 * (absReturn * 10);
        volumeBase = clamp(volumeBase, 10000, 300000);
        let volume = Math.round(volumeBase * (0.7 + rand(0, 0.6)));
        if (s.isNoManipulator)
            volume = Math.round(volume * 0.3);
        volume = Math.round(volume);
        // 保存K线
        s.history.push({ open: round(open), high: round(high), low: round(low), close: round(newPrice), volume });
        s.volumes.push(volume);
        while (s.volumes.length < s.history.length)
            s.volumes.push(0);
        // 限制历史长度
        if (s.history.length > 200) {
            s.history.shift();
            s.volumes.shift();
        }
        // 卡片效果（cardBias）倒数：每天结束后 -1 天，到期清零
        if (s.cardBiasDays > 0) {
            s.cardBiasDays--;
            if (s.cardBiasDays === 0) {
                s.cardBias = 0;
            }
        }
        // 调试：触发反操盘
        const cd = { crazeDays: 0, crazeReturn: 0 };
        // 这里简化：直接根据近期累计涨幅判定
        if (s.history.length >= 10) {
            let daysUp = 0;
            let sumReturn = 0;
            for (let k = s.history.length - 10; k < s.history.length; k++) {
                const item = s.history[k];
                if (k > 0 && item.close > s.history[k - 1].close)
                    daysUp++;
                sumReturn += (item.close - (k > 0 ? s.history[k - 1].close : item.close)) / Math.max(item.close, 1);
            }
            if (daysUp >= 9 && sumReturn > 0.6 && !s.isNoManipulator) {
                s.isNoManipulator = true;
                s.noManipulatorDays = 200;
                s.isConsolidating = false;
                s.consolidateDays = 0;
            }
        }
        // 更新主字段
        s.price = round(newPrice);
        s.open = round(open);
        s.high = round(high);
        s.low = round(low);
        s.change = prevClose > 0 ? ((newPrice - prevClose) / prevClose) * 100 : 0;
    }
}
function movingAverage(stock, days) {
    const n = stock.history.length;
    if (n === 0)
        return 0;
    const start = Math.max(0, n - days);
    let sum = 0;
    let count = 0;
    for (let i = start; i < n; i++) {
        sum += stock.history[i].close;
        count++;
    }
    return count > 0 ? sum / count : stock.history[n - 1].close;
}
function round(n) {
    return Math.round(n * 100) / 100;
}
// ============ 技术指标 ============
function calcMA(prices, period) {
    const ma = [];
    for (let i = 0; i < prices.length; i++) {
        if (i + 1 < period) {
            ma.push(null);
            continue;
        }
        let sum = 0;
        for (let j = i + 1 - period; j <= i; j++)
            sum += prices[j];
        ma.push(Math.round((sum / period) * 100) / 100);
    }
    return ma;
}
function calcMACD(prices, fast = 12, slow = 26, signal = 9) {
    const emaFast = [];
    const emaSlow = [];
    const dif = [];
    const dea = [];
    const macd = [];
    let prevEmaFast = prices[0];
    let prevEmaSlow = prices[0];
    let prevDea = 0;
    const kFast = 2 / (fast + 1);
    const kSlow = 2 / (slow + 1);
    const kSignal = 2 / (signal + 1);
    for (let i = 0; i < prices.length; i++) {
        const price = prices[i];
        if (i === 0) {
            emaFast.push(price);
            emaSlow.push(price);
        }
        else {
            const ef = price * kFast + prevEmaFast * (1 - kFast);
            const es = price * kSlow + prevEmaSlow * (1 - kSlow);
            emaFast.push(ef);
            emaSlow.push(es);
            prevEmaFast = ef;
            prevEmaSlow = es;
        }
        const d = emaFast[i] - emaSlow[i];
        dif.push(d);
        if (i === 0) {
            dea.push(d);
            prevDea = d;
        }
        else {
            const de = d * kSignal + prevDea * (1 - kSignal);
            dea.push(de);
            prevDea = de;
        }
        macd.push(2 * (dif[i] - dea[i]));
    }
    return { dif, dea, macd };
}
function calcRSI(prices, period = 14) {
    const rsi = [];
    let gain = 0, loss = 0;
    for (let i = 1; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (i <= period) {
            if (diff >= 0)
                gain += diff;
            else
                loss -= diff;
            if (i === period) {
                const avgGain = gain / period;
                const avgLoss = loss / period;
                const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
                rsi.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100);
            }
            else {
                rsi.push(null);
            }
        }
        else {
            const prevAvgGain = gain / period;
            const prevAvgLoss = loss / period;
            const curGain = diff >= 0 ? diff : 0;
            const curLoss = diff < 0 ? -diff : 0;
            const avgGain = (prevAvgGain * (period - 1) + curGain) / period;
            const avgLoss = (prevAvgLoss * (period - 1) + curLoss) / period;
            gain = avgGain * period;
            loss = avgLoss * period;
            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi.push(Math.round((100 - 100 / (1 + rs)) * 100) / 100);
        }
    }
    while (rsi.length < prices.length)
        rsi.unshift(null);
    return rsi;
}
// ============ 初始化股票 ============
function generateStocks() {
    const stocks = [];
    STOCK_NAMES.forEach((sector, si) => {
        sector.stocks.forEach((name, i) => {
            const base = Math.floor(Math.random() * 80) + 40;
            const initialPrice = Math.round(base * (0.85 + Math.random() * 0.3) * 100) / 100;
            const history = [{ open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }];
            const stock = {
                symbol: `STK${String(si * 4 + i + 1).padStart(2, '0')}`,
                name,
                sector: sector.sector,
                price: initialPrice,
                change: 0,
                trend: null,
                trendDays: 0,
                cardBias: 0,
                cardBiasDays: 0,
                cardBiasLastUsedTurn: -999,
                cardBiasShield: false,
                news: undefined,
                limitUp: false,
                limitDown: false,
                history,
                base,
                eventEffect: 1.0,
                eventDays: 0,
                eventDesc: '无重大事件',
                consolidateDays: 0,
                isConsolidating: false,
                isNoManipulator: false,
                noManipulatorDays: 0,
                volumes: [0],
                open: initialPrice,
                high: initialPrice,
                low: initialPrice,
                kline: [initialPrice]
            };
            // 预热 30 天历史
            for (let d = 0; d < 30; d++) {
                simulateMarketDay([stock]);
            }
            // 重置成交量
            stock.volumes = stock.volumes.map(() => 0);
            stocks.push(stock);
        });
    });
    OPERATOR_PLAN.target = randInt(0, stocks.length - 1);
    OPERATOR_PLAN.stage = 1;
    OPERATOR_PLAN.daysLeft = randInt(4, 8);
    return stocks;
}
function generateFutures() {
    const futures = [];
    // 真实参考价格（单位: 元/吨 或 元/盎司，游戏中简化处理）
    const basePrices = {
        gold: { price: 1800, unit: 1, volatility: 0.025 }, // 黄金（贵金属/手）
        silver: { price: 25, unit: 1, volatility: 0.030 },
        diamond: { price: 5000, unit: 1, volatility: 0.020 },
        cement: { price: 400, unit: 1, volatility: 0.040 }, // 水泥
        steel: { price: 4500, unit: 1, volatility: 0.045 }, // 钢材
        rubber: { price: 15000, unit: 1, volatility: 0.050 }, // 橡胶
        oil: { price: 600, unit: 1, volatility: 0.055 }, // 原油
        wheat: { price: 3000, unit: 1, volatility: 0.060 } // 小麦
    };
    FUTURES_NAMES.forEach((f, i) => {
        const cfg = basePrices[f.type];
        const base = cfg.price;
        const initialPrice = Math.round(base * (0.85 + Math.random() * 0.3) * 100) / 100;
        const history = [{ open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }];
        const fc = {
            symbol: `FT${String(i + 1).padStart(2, '0')}`,
            name: f.name,
            type: f.type,
            category: f.category,
            isMaterial: f.isMaterial,
            price: initialPrice,
            change: 0,
            unit: cfg.unit,
            base,
            volatility: cfg.volatility,
            history,
            volumes: [0],
            eventEffect: 1.0,
            eventDays: 0,
            eventDesc: '无重大事件',
            open: initialPrice,
            high: initialPrice,
            low: initialPrice,
            kline: [initialPrice],
            consolidateDays: 0,
            isConsolidating: false,
            isNoManipulator: false,
            noManipulatorDays: 0,
            cardBias: 0,
            cardBiasDays: 0,
            cardBiasLastUsedTurn: -999,
            cardBiasShield: false,
            // 涨跌停 = 单日波动率 × 6（与之前一致）
            limitThreshold: cfg.volatility * 6,
            limitUp: false,
            limitDown: false,
            // 合约到期天数（30 天后到期，可实物交割）
            expiresInDays: 30 + Math.floor(Math.random() * 30),
            expiresOnDay: 0 // 房间创建时计算
        };
        futures.push(fc);
    });
    // 预热 30 天
    for (let d = 0; d < 30; d++) {
        // 期货用更平稳的算法（无操盘手，纯市场模拟）
        futures.forEach(f => simulateFuturesDay(f));
    }
    // 重置成交量
    futures.forEach(f => {
        f.volumes = f.history.map(() => 0);
        f.price = f.history[f.history.length - 1].close;
    });
    return futures;
}
// 期货模拟：每个品种独立波动率和事件 + 涨跌停
function simulateFuturesDay(f) {
    if (f.consolidateDays > 0) {
        f.consolidateDays--;
        if (f.consolidateDays === 0)
            f.isConsolidating = false;
    }
    if (f.noManipulatorDays > 0) {
        f.noManipulatorDays--;
        f.isNoManipulator = true;
    }
    else {
        f.isNoManipulator = false;
    }
    // 重置每日涨跌停状态（每天重新计算）
    f.limitUp = false;
    f.limitDown = false;
    if (f.eventDays > 0) {
        f.eventDays--;
        if (f.eventDays === 0) {
            f.eventEffect = 1.0;
            f.eventDesc = '无重大事件';
        }
    }
    else if (Math.random() < 0.10) {
        // 根据商品类型生成不同的"基本面事件"
        const r = randInt(0, 4);
        if (f.category === 'precious') {
            switch (r) {
                case 0:
                    f.eventEffect = 1.18;
                    f.eventDesc = '央行储备增加';
                    f.eventDays = randInt(7, 12);
                    break;
                case 1:
                    f.eventEffect = 0.85;
                    f.eventDesc = '避险情绪降温';
                    f.eventDays = randInt(5, 10);
                    break;
                case 2:
                    f.eventEffect = 1.12;
                    f.eventDesc = '地缘政治紧张';
                    f.eventDays = randInt(6, 14);
                    break;
                case 3:
                    f.eventEffect = 0.90;
                    f.eventDesc = '开采技术突破';
                    f.eventDays = randInt(5, 11);
                    break;
                case 4:
                    f.eventEffect = 1.25;
                    f.eventDesc = '稀缺性溢价';
                    f.eventDays = randInt(4, 8);
                    break;
            }
        }
        else if (f.category === 'material') {
            switch (r) {
                case 0:
                    f.eventEffect = 1.22;
                    f.eventDesc = '基建需求激增';
                    f.eventDays = randInt(7, 14);
                    break;
                case 1:
                    f.eventEffect = 0.82;
                    f.eventDesc = '产能严重过剩';
                    f.eventDays = randInt(5, 10);
                    break;
                case 2:
                    f.eventEffect = 1.15;
                    f.eventDesc = '环保限产令';
                    f.eventDays = randInt(6, 12);
                    break;
                case 3:
                    f.eventEffect = 0.88;
                    f.eventDesc = '地产行业萎缩';
                    f.eventDays = randInt(5, 11);
                    break;
                case 4:
                    f.eventEffect = 1.30;
                    f.eventDesc = '原材料供给中断';
                    f.eventDays = randInt(4, 8);
                    break;
            }
        }
        else if (f.category === 'energy') {
            switch (r) {
                case 0:
                    f.eventEffect = 1.20;
                    f.eventDesc = 'OPEC减产协议';
                    f.eventDays = randInt(7, 12);
                    break;
                case 1:
                    f.eventEffect = 0.83;
                    f.eventDesc = '页岩油增产';
                    f.eventDays = randInt(5, 10);
                    break;
                case 2:
                    f.eventEffect = 1.18;
                    f.eventDesc = '中东局势紧张';
                    f.eventDays = randInt(6, 14);
                    break;
                case 3:
                    f.eventEffect = 0.88;
                    f.eventDesc = '全球需求疲软';
                    f.eventDays = randInt(5, 11);
                    break;
                case 4:
                    f.eventEffect = 1.25;
                    f.eventDesc = '战略储备释放';
                    f.eventDays = randInt(4, 8);
                    break;
            }
        }
        else {
            switch (r) {
                case 0:
                    f.eventEffect = 1.20;
                    f.eventDesc = '产区干旱减产';
                    f.eventDays = randInt(7, 12);
                    break;
                case 1:
                    f.eventEffect = 0.85;
                    f.eventDesc = '丰产丰收预期';
                    f.eventDays = randInt(5, 10);
                    break;
                case 2:
                    f.eventEffect = 1.15;
                    f.eventDesc = '出口禁令利好';
                    f.eventDays = randInt(6, 14);
                    break;
                case 3:
                    f.eventEffect = 0.88;
                    f.eventDesc = '进口大幅增加';
                    f.eventDays = randInt(5, 11);
                    break;
                case 4:
                    f.eventEffect = 1.25;
                    f.eventDesc = '食品危机恐慌';
                    f.eventDays = randInt(4, 8);
                    break;
            }
        }
    }
    const lastClose = f.history[f.history.length - 1].close;
    const prevClose = f.history.length > 1 ? f.history[f.history.length - 2].close : lastClose;
    const ma5 = movingAverageFutures(f, 5);
    const ma10 = movingAverageFutures(f, 10);
    const fundamentalSignal = (f.base * f.eventEffect - lastClose) / Math.max(lastClose, 1);
    const momentum = prevClose > 0 ? (lastClose - prevClose) / prevClose : 0;
    // 期货价格主要由基本面 + 趋势驱动（每个品种波动率不同）
    const meanReversion = (f.base * f.eventEffect - lastClose) / lastClose * 0.06;
    const trendBias = (ma5 - ma10) / Math.max(ma10, 1) * 0.5;
    const eventBias = (f.eventEffect - 1.0) * 0.08;
    const noise = rand(-f.volatility, f.volatility);
    // ============ 红心/黑心卡影响（散户/机构/游资/量化四类参与者）============
    // 期货卡片效果：直接放大趋势 + 偏置噪声分布（不修改波动率基础值）
    const fcb = f.cardBias || 0;
    const cardTrendBias = fcb * 0.04; // 最大 ±4% 趋势加成
    const cardMomentumBias = (ma5 > ma10 ? 1 : -1) * Math.abs(fcb) * 0.02; // 顺势放大
    const cardNoiseBias = fcb * f.volatility * 0.3; // 噪声分布偏移
    const maxChange = f.limitThreshold;
    let dailyReturn = clamp(meanReversion + trendBias + eventBias + momentum * 0.3 + noise +
        cardTrendBias + cardMomentumBias + cardNoiseBias, -maxChange, maxChange);
    if (f.isConsolidating && !f.isNoManipulator) {
        dailyReturn = clamp(dailyReturn, -0.005, 0.005);
    }
    dailyReturn = clamp(dailyReturn, -maxChange, maxChange);
    const newPrice = Math.max(0.01, Math.round(lastClose * Math.exp(dailyReturn) * 100) / 100);
    // 涨跌停检测
    if (dailyReturn >= maxChange - 0.0001) {
        f.limitUp = true;
    }
    if (dailyReturn <= -maxChange + 0.0001) {
        f.limitDown = true;
    }
    const open = lastClose;
    const range = Math.max(0.01, Math.abs(newPrice - open));
    const extra = range * (0.05 + Math.random() * 0.1);
    const high = Math.max(open, newPrice) + extra;
    const low = Math.max(0.01, Math.min(open, newPrice) - extra);
    const absReturn = Math.abs(dailyReturn);
    const volume = Math.round((5000 + 30000 * absReturn) * (0.7 + rand(0, 0.6)));
    f.history.push({ open: round(open), high: round(high), low: round(low), close: round(newPrice), volume });
    f.volumes.push(volume);
    if (f.history.length > 200) {
        f.history.shift();
        f.volumes.shift();
    }
    // 卡片效果（cardBias）倒数：每天结束后 -1 天，到期清零
    if (f.cardBiasDays > 0) {
        f.cardBiasDays--;
        if (f.cardBiasDays === 0) {
            f.cardBias = 0;
        }
    }
    f.price = round(newPrice);
    f.open = round(open);
    f.high = round(high);
    f.low = round(low);
    f.change = prevClose > 0 ? ((newPrice - prevClose) / prevClose) * 100 : 0;
}
function movingAverageFutures(f, days) {
    const n = f.history.length;
    if (n === 0)
        return 0;
    const start = Math.max(0, n - days);
    let sum = 0, count = 0;
    for (let i = start; i < n; i++) {
        sum += f.history[i].close;
        count++;
    }
    return count > 0 ? sum / count : f.history[n - 1].close;
}
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}
function calculateAssets(player, room) {
    let total = player.cash + player.deposit;
    // 房产估值
    total += player.properties.reduce((sum, cellId) => {
        const cell = room.cells[cellId];
        if (!cell)
            return sum;
        let val = cell.basePrice * (1 + (cell.level || 0) * 0.5);
        if (cell.upgrade === 'hotel')
            val *= 3;
        if (cell.upgrade === 'smelter')
            val *= 4;
        if (cell.upgrade === 'diamondMine')
            val *= 5;
        if (cell.upgrade === 'agency')
            val *= 4;
        return sum + val;
    }, 0);
    // 股票市值（多头 - 空头）
    total += player.stocks.reduce((sum, holding) => {
        const stock = room.stocks.find(s => s.symbol === holding.symbol);
        if (!stock)
            return sum;
        return sum + stock.price * (holding.quantity - (holding.shortQuantity || 0));
    }, 0);
    // 期货持仓权益：多头按当前市值，空头按冻结初始保证金加浮动盈亏
    total += (player.futuresHoldings || []).reduce((sum, holding) => {
        const futures = room.futures.find(f => f.symbol === holding.symbol);
        if (!futures)
            return sum;
        const longEquity = holding.longQuantity > 0
            ? futures.price * futures.unit * holding.longQuantity
            : 0;
        const shortEquity = holding.shortQuantity > 0
            ? (holding.shortInitialMargin || futures.price * futures.unit * holding.shortQuantity * FUTURES_INITIAL_MARGIN_RATE) +
                (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity
            : 0;
        return sum + longEquity + shortEquity;
    }, 0);
    // 钻石估值 = 当前钻石期货价格 × 数量
    const diamondFutures = room.futures.find(f => f.type === 'diamond');
    const diamondPrice = diamondFutures ? diamondFutures.price : 5000;
    total += player.diamonds * diamondPrice;
    // 建材估值（按对应期货价格）
    const cementFutures = room.futures.find(f => f.type === 'cement');
    const steelFutures = room.futures.find(f => f.type === 'steel');
    const rubberFutures = room.futures.find(f => f.type === 'rubber');
    const goldFutures = room.futures.find(f => f.type === 'gold');
    total += player.materials.cement * (cementFutures ? cementFutures.price : 400);
    total += player.materials.steel * (steelFutures ? steelFutures.price : 4500);
    total += player.materials.rubber * (rubberFutures ? rubberFutures.price : 15000);
    total += player.materials.preciousMetals * (goldFutures ? goldFutures.price : 1800);
    // 减去未还贷款（本金 + 利息）
    total -= player.loans.reduce((sum, loan) => {
        const daysElapsed = LOAN_TURNS_UNTIL_DUE - loan.turnsRemaining;
        const interest = Math.floor(loan.amount * loan.interestRate * Math.min(daysElapsed, LOAN_TURNS_UNTIL_DUE) / LOAN_TURNS_UNTIL_DUE);
        return sum + loan.amount + interest;
    }, 0);
    return Math.max(0, total);
}
// 获取钻石期货价格
function getDiamondPrice(room) {
    const diamond = room.futures.find(f => f.type === 'diamond');
    return diamond ? diamond.price : 5000;
}
// 期货做空的每日权益检查：权益低于维持保证金时立即强制平仓。
function checkFuturesMarginCalls(room) {
    room.players.forEach(player => {
        if (player.isBankrupt || !player.futuresHoldings)
            return;
        player.futuresHoldings.forEach(holding => {
            if (holding.shortQuantity <= 0)
                return;
            const futures = room.futures.find(f => f.symbol === holding.symbol);
            if (!futures)
                return;
            const notional = futures.price * futures.unit * holding.shortQuantity;
            const initialMargin = holding.shortInitialMargin || notional * FUTURES_INITIAL_MARGIN_RATE;
            const maintenanceMargin = notional * FUTURES_MAINTENANCE_MARGIN_RATE;
            const floatingPnl = (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity;
            const equity = initialMargin + floatingPnl;
            holding.shortMaintenanceMargin = maintenanceMargin;
            if (equity >= maintenanceMargin)
                return;
            const closeFee = Math.floor(notional * FUTURES_FEE_RATE);
            const settlement = initialMargin + floatingPnl - closeFee;
            const settled = settlement >= 0
                ? (addFunds(player, settlement, 'deposit'), true)
                : deductFunds(player, -settlement, 'auto');
            holding.shortQuantity = 0;
            holding.shortAvgCost = 0;
            holding.shortInitialMargin = 0;
            holding.shortMaintenanceMargin = 0;
            if (!settled) {
                player.isBankrupt = true;
                sendMessage(room, 'error', `${player.name} ${futures.name} 做空亏损超过可用资金，强制平仓失败，已破产`);
            }
            else {
                sendMessage(room, 'warning', `${player.name} ${futures.name} 触发强制平仓：权益 $${Math.round(equity)} 低于维持保证金 $${Math.round(maintenanceMargin)}`);
            }
        });
    });
}
function broadcastRoomState(room) {
    // 优化：图表数据只发最近 60 根 K 线（其余服务端存储完整），减少 socket 传输量
    const slimStock = (s) => ({
        ...s,
        history: s.history.slice(-60),
        volumes: s.volumes.slice(-60),
        kline: s.kline ? s.kline.slice(-60) : undefined
    });
    const slimFutures = (f) => ({
        ...f,
        history: f.history.slice(-60),
        volumes: f.volumes.slice(-60),
        kline: f.kline ? f.kline.slice(-60) : undefined
    });
    const state = {
        roomCode: room.code,
        mode: room.mode,
        targetAssets: room.targetAssets,
        maxPlayers: room.maxPlayers || (room.mode === 'multiplayer' ? 6 : room.players.length),
        winnerId: room.winnerId,
        currentTurn: room.currentTurn,
        players: room.players.map(p => ({
            ...p,
            socketId: undefined,
            totalAssets: calculateAssets(p, room),
            isCurrentTurn: room.players.indexOf(p) === room.currentPlayerIndex,
            loans: p.loans.map(l => ({ ...l }))
        })),
        cells: room.cells,
        stocks: room.stocks.map(slimStock),
        futures: room.futures.map(slimFutures),
        gameDate: room.gameDate,
        currentPlayerIndex: room.currentPlayerIndex,
        gamePhase: room.phase,
        diceValue: room.diceValue,
        forcedDice: room.forcedDice
    };
    io.to(room.code).emit('gameState', state);
}
function sendMessage(room, type, content) {
    io.to(room.code).emit('message', { type, content });
}
// ============ Loan System ============
function getMaxLoan(player, cells) {
    let totalPropertyValue = 0;
    player.properties.forEach(cellId => {
        const cell = cells[cellId];
        if (cell) {
            totalPropertyValue += cell.basePrice * (1 + (cell.level || 0) * 0.5);
        }
    });
    if (totalPropertyValue === 0)
        return 0;
    return Math.floor(totalPropertyValue * 10);
}
function getTotalDebt(player) {
    return player.loans.reduce((sum, loan) => sum + loan.amount + Math.floor(loan.amount * loan.interestRate), 0);
}
// ============ Stock News System ============
function generateStockNews(room) {
    // 随机给1-2支股票添加消息
    const count = Math.random() < 0.3 ? 2 : 1;
    const indices = [...Array(room.stocks.length).keys()].sort(() => Math.random() - 0.5).slice(0, count);
    indices.forEach(idx => {
        const isGood = Math.random() > 0.5;
        const news = isGood
            ? STOCK_NEWS.good[Math.floor(Math.random() * STOCK_NEWS.good.length)]
            : STOCK_NEWS.bad[Math.floor(Math.random() * STOCK_NEWS.bad.length)];
        room.stocks[idx].news = news;
        // 只广播给：站在股票交易所 / 拥有同花顺软件 的玩家
        // 其他玩家只看到市场上有"突发消息"的占位提示
        const stock = room.stocks[idx];
        const tipMsg = `${stock.name}(${stock.symbol}): 📢 突发消息（需前往股票交易所或购买同花顺软件查看详情）`;
        io.to(room.code).emit('message', { type: 'info', content: tipMsg });
        // 给拥有同花顺或站在交易所的玩家发送详细消息
        room.players.forEach(p => {
            if (p.hasTonghuashun || p.atStockExchange) {
                io.to(p.socketId).emit('message', {
                    type: 'info',
                    content: `${stock.name}(${stock.symbol}): ${news}`
                });
            }
        });
    });
}
// ============ Update Stock Prices ============
function updateStockPrices(room) {
    const LIMIT_THRESHOLD = 10; // 涨跌停阈值 10%
    // 1) 调用高级模拟算法（散户/机构/游资/量化/操盘手）
    simulateMarketDay(room.stocks);
    // 2) 涨跌停检测 + 技术指标计算
    room.stocks.forEach(stock => {
        stock.limitUp = false;
        stock.limitDown = false;
        if (stock.change >= LIMIT_THRESHOLD) {
            stock.limitUp = true;
        }
        else if (stock.change <= -LIMIT_THRESHOLD) {
            stock.limitDown = true;
        }
        // 计算技术指标
        const closes = stock.history.map(h => h.close);
        stock.ma5 = calcMA(closes, 5);
        stock.ma10 = calcMA(closes, 10);
        stock.ma20 = calcMA(closes, 20);
        stock.rsi = calcRSI(closes, 14);
        const macdData = calcMACD(closes);
        stock.macd = macdData.macd;
        stock.dif = macdData.dif;
        stock.dea = macdData.dea;
        // K线缓存 (近30天)
        stock.kline = closes.slice(-30);
        // 新闻
        stock.news = stock.eventDesc !== '无重大事件' ? stock.eventDesc : undefined;
    });
    // 3) 重新计算玩家总资产（钻石按期货价）
    recalcAllAssets(room);
    // 生成股票新闻
    generateStockNews(room);
}
// 重新计算玩家总资产（钻石按期货价、贷款按已用天数计息）
function recalcAllAssets(room) {
    room.players.forEach(player => {
        if (!player.isBankrupt)
            player.totalAssets = calculateAssets(player, room);
    });
}
// ============ Update Futures Prices ============
function updateFuturesPrices(room) {
    room.futures.forEach(f => {
        // 减少到期天数
        if (f.expiresInDays > 0) {
            f.expiresInDays--;
            if (f.expiresInDays === 0) {
                // 合约到期：自动处理所有玩家的持仓
                handleFuturesExpiry(room, f);
                // 重新生成合约（保持市场活跃）
                const newF = generateFutures().find(nf => nf.type === f.type);
                if (newF) {
                    newF.expiresOnDay = room.currentTurn + newF.expiresInDays;
                    f.symbol = newF.symbol;
                    f.expiresInDays = newF.expiresInDays;
                    f.expiresOnDay = newF.expiresOnDay;
                    f.base = newF.base;
                    f.price = newF.base;
                    f.history = newF.history;
                    f.volumes = newF.volumes;
                }
                sendMessage(room, 'warning', `📅 ${f.name} 合约已到期，市场推出新合约`);
            }
        }
        simulateFuturesDay(f);
        const closes = f.history.map(h => h.close);
        f.ma5 = calcMA(closes, 5);
        f.ma10 = calcMA(closes, 10);
        f.ma20 = calcMA(closes, 20);
        f.kline = closes.slice(-30);
        // 期货事件消息：只广播给期货交易所 / 拥有同花顺软件的玩家
        if (f.eventDesc !== '无重大事件') {
            const tipMsg = `${f.name}: 📢 突发事件（需前往期货交易所或购买同花顺软件查看详情）`;
            io.to(room.code).emit('message', { type: 'info', content: tipMsg });
            room.players.forEach(p => {
                if (p.hasTonghuashun || p.atFuturesExchange) {
                    io.to(p.socketId).emit('message', {
                        type: 'info',
                        content: `${f.name}: ${f.eventDesc}（剩余 ${f.eventDays} 天）`
                    });
                }
            });
        }
        f.news = f.eventDesc !== '无重大事件' ? f.eventDesc : undefined;
    });
    recalcAllAssets(room);
}
// 合约到期处理：自动按当前价平仓（或强制平仓）
function handleFuturesExpiry(room, futures) {
    const matMap = {
        cement: 'cement', steel: 'steel', rubber: 'rubber'
    };
    room.players.forEach(p => {
        if (!p.futuresHoldings)
            return;
        const h = p.futuresHoldings.find(fh => fh.symbol === futures.symbol);
        if (!h)
            return;
        // 自动按当前价强制平仓（未主动交割）
        if (h.longQuantity > 0) {
            const profit = (futures.price - h.longAvgCost) * futures.unit * h.longQuantity;
            const releaseFrozen = h.longFrozenCost;
            p.deposit += releaseFrozen + profit;
            sendMessage(room, 'info', `${p.name} 的 ${h.longQuantity} 手 ${futures.name} 多头到期自动平仓，${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}`);
            h.longQuantity = 0;
            h.longAvgCost = 0;
            h.longFrozenCost = 0;
        }
        if (h.shortQuantity > 0) {
            const profit = (h.shortAvgCost - futures.price) * futures.unit * h.shortQuantity;
            p.deposit += h.shortInitialMargin + profit;
            sendMessage(room, 'info', `${p.name} 的 ${h.shortQuantity} 手 ${futures.name} 空头到期自动平仓，${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}`);
            h.shortQuantity = 0;
            h.shortAvgCost = 0;
            h.shortInitialMargin = 0;
            h.shortMaintenanceMargin = 0;
        }
    });
}
// ============ Process Cell Event ============
function processCellEvent(room, player) {
    const cell = room.cells[player.position];
    // 清除经过银行标记（只有站在银行才有效）
    player.passedBank = false;
    player.atStockExchange = false;
    player.atFuturesExchange = false;
    // 地块访问计数（升级用）：玩家落在自己拥有的地块上时 +1
    if (cell.type === 'empty' && cell.owner === player.id) {
        cell.visitCount = (cell.visitCount || 0) + 1;
    }
    switch (cell.type) {
        case 'start':
            player.cash += START_BONUS;
            sendMessage(room, 'info', `${player.name} 经过起点，获得 $${START_BONUS}`);
            break;
        case 'bank':
            player.passedBank = true;
            sendMessage(room, 'info', `${player.name} 来到银行，可以使用存/取款/贷款服务`);
            break;
        case 'stock':
            player.atStockExchange = true;
            sendMessage(room, 'info', `${player.name} 来到股票交易所，可查看股票利好利空消息或购买同花顺软件`);
            break;
        case 'futures':
            player.atFuturesExchange = true;
            sendMessage(room, 'info', `${player.name} 来到期货交易所，可查看期货事件、交易建材、兑换吸引力`);
            break;
        case 'chance': {
            // 走到机会地皮：随机获得一张可购买卡片或建材
            const r = Math.random();
            if (r < 0.4) {
                const giftCards = ['停留卡', '骰子卡', '均贫卡', '红心卡', '黑心卡', '地皮升级卡', '护盾卡', '谣言卡'];
                const cardName = giftCards[Math.floor(Math.random() * giftCards.length)];
                player.cards.push(cardName);
                sendMessage(room, 'success', `${player.name} 抽到机会卡，获得 [${cardName}]`);
            }
            else if (r < 0.7) {
                // 建材
                const materials = ['cement', 'steel', 'rubber'];
                const mat = materials[Math.floor(Math.random() * materials.length)];
                const qty = Math.floor(Math.random() * 5) + 3;
                player.materials[mat] += qty;
                const matName = mat === 'cement' ? '水泥' : mat === 'steel' ? '钢材' : '橡胶';
                sendMessage(room, 'success', `${player.name} 获得建材奖励：${matName} ×${qty}`);
            }
            else {
                // 现金
                player.cash += 1000;
                sendMessage(room, 'info', `${player.name} 获得 $1000`);
            }
            break;
        }
        case 'destiny': {
            const destinyEvent = Math.random();
            if (destinyEvent < 0.3) {
                player.cash -= 500;
                sendMessage(room, 'warning', `${player.name} 命运不佳，损失 $500`);
            }
            else if (destinyEvent < 0.5) {
                player.deposit += 1000;
                sendMessage(room, 'success', `${player.name} 命运眷顾，存款 +$1000`);
            }
            else if (destinyEvent < 0.7) {
                player.position = 0;
                player.cash += START_BONUS;
                sendMessage(room, 'info', `${player.name} 命运降临，回到起点`);
            }
            else {
                player.diamonds += 1;
                sendMessage(room, 'success', `${player.name} 命运眷顾，获得 1💎`);
            }
            break;
        }
        case 'diamond':
            const diamondReward = Math.floor(Math.random() * 21) + 30; // 30-50
            player.diamonds += diamondReward;
            sendMessage(room, 'success', `${player.name} 来到钻石格，获得 ${diamondReward}💎`);
            break;
        case 'realestate': {
            // 房地产交易中心：拍卖 + 出售自有地皮换现金
            const auctionCell = room.cells.find(c => c.auctionActive);
            if (auctionCell) {
                sendMessage(room, 'warning', `🏛️ ${player.name} 来到房地产交易中心 - 拍卖进行中！`);
            }
            else {
                const daysSinceStart = room.currentTurn;
                if (daysSinceStart > 0 && daysSinceStart % 7 === 0) {
                    startNewAuction(room);
                    sendMessage(room, 'warning', `🏛️ 拍卖开始！前往房地产交易中心或输入 buyAuction 出价`);
                }
                else {
                    sendMessage(room, 'info', `🏛️ ${player.name} 在房地产交易中心，可出售自己的地皮换取现金`);
                }
            }
            break;
        }
        case 'empty':
            // 拍卖地皮：免过路费
            if (cell.fromAuction) {
                sendMessage(room, 'info', `${player.name} 踏入拍卖地 [${cell.name}]（免过路费）`);
                break;
            }
            if (cell.owner && cell.owner !== player.id) {
                const owner = room.players.find(p => p.id === cell.owner);
                if (owner && !owner.isBankrupt) {
                    // 计算过路费：基础 + 等级 + 房产中介翻倍
                    let fee = cell.basePrice * Math.pow(2, cell.level);
                    if (cell.upgrade === 'agency')
                        fee *= 2;
                    // 该业主是否有任意房产是房产中介，过路费翻倍
                    const hasAgency = owner.properties.some(pid => room.cells[pid]?.upgrade === 'agency');
                    if (hasAgency)
                        fee *= 2;
                    // 🏨 酒店 buff：所有地皮费用 +10%
                    const hasHotel = owner.properties.some(pid => room.cells[pid]?.upgrade === 'hotel');
                    if (hasHotel)
                        fee = Math.ceil(fee * 1.1);
                    // 📈 增值系数：每次收过路费 +2%，封顶 200%
                    const appreciation = cell.appreciation || 0;
                    const appreciationMul = 1 + Math.min(appreciation, 2.0);
                    fee = Math.ceil(fee * appreciationMul);
                    if (player.cash >= fee) {
                        player.cash -= fee;
                        owner.cash += fee;
                        // 每次收过路费：增值 +2%（封顶 200% = 3.0）
                        cell.appreciation = Math.min(2.0, appreciation + 0.02);
                        sendMessage(room, 'info', `${player.name} 支付过路费 $${fee.toLocaleString()} 给 ${owner.name}${hasHotel ? '（含酒店+10%加成）' : ''}${appreciation > 0 ? `（含增值+${Math.round(appreciation * 100)}%）` : ''}`);
                    }
                    else {
                        player.isBankrupt = true;
                        owner.cash += player.cash;
                        owner.deposit += player.deposit;
                        player.cash = 0;
                        player.deposit = 0;
                        sendMessage(room, 'error', `${player.name} 现金不足，破产!`);
                    }
                }
            }
            break;
    }
    // 检查破产
    if (player.cash + player.deposit < 0) {
        player.isBankrupt = true;
        player.properties.forEach(propId => {
            room.cells[propId].owner = null;
            room.cells[propId].level = 0;
        });
        sendMessage(room, 'error', `${player.name} 破产了!`);
    }
}
// ============ Real Estate Auction System ============
// 选取当前无人拥有的高品质地皮（basePrice 最高 3 块）作为本次拍卖品
function startNewAuction(room) {
    // 清除上次拍卖标记
    room.cells.forEach(c => {
        c.auctionActive = false;
        c.auctionReservedPrice = undefined;
        c.auctionHighestBid = undefined;
        c.auctionHighestBidder = undefined;
    });
    // 选无人拥有的高价地皮
    const candidates = room.cells
        .filter(c => c.type === 'empty' && !c.owner)
        .sort((a, b) => b.basePrice - a.basePrice)
        .slice(0, 3);
    if (candidates.length === 0) {
        sendMessage(room, 'warning', '🏛️ 本次拍卖取消（没有可拍卖的无主地皮）');
        return;
    }
    candidates.forEach(c => {
        c.auctionActive = true;
        c.auctionReservedPrice = Math.floor(c.basePrice * 0.5);
        c.auctionHighestBid = c.auctionReservedPrice;
        c.auctionHighestBidder = null;
    });
    const desc = candidates.map(c => `${c.name}(底价$${(c.auctionReservedPrice || 0).toLocaleString()})`).join('、');
    sendMessage(room, 'warning', `🏛️ 拍卖开始！拍品：${desc}。玩家可通过「buyAuction cellId 出价」参与竞拍（每次加价至少10%）`);
}
// 拍卖结束：把地皮给最高出价者
function finalizeAuction(room) {
    room.cells.forEach(c => {
        if (!c.auctionActive)
            return;
        const reserved = c.auctionReservedPrice || 0;
        const highest = c.auctionHighestBid || 0;
        if (c.auctionHighestBidder && highest > reserved) {
            const winner = room.players.find(p => p.id === c.auctionHighestBidder);
            if (winner && winner.cash >= highest) {
                winner.cash -= highest;
                c.owner = winner.id;
                c.fromAuction = true;
                c.level = 0;
                c.price = c.basePrice;
                c.visitCount = 0;
                if (!winner.properties.includes(c.id))
                    winner.properties.push(c.id);
                sendMessage(room, 'success', `🏆 ${winner.name} 以 $${highest.toLocaleString()} 拍得 [${c.name}]（永久免过路费，可减半升级）`);
            }
            else {
                sendMessage(room, 'info', `🏛️ [${c.name}] 流拍（最高出价者资金不足）`);
            }
        }
        else {
            sendMessage(room, 'info', `🏛️ [${c.name}] 流拍（无有效出价）`);
        }
        c.auctionActive = false;
        c.auctionReservedPrice = undefined;
        c.auctionHighestBid = undefined;
        c.auctionHighestBidder = undefined;
    });
}
// ============ Process Loans (called each turn) ============
function processLoans(room) {
    room.players.forEach(player => {
        if (player.loans.length === 0)
            return;
        // 每回合减少剩余回合
        player.loans.forEach(loan => {
            loan.turnsRemaining--;
        });
        // 检查到期贷款
        const dueLoans = player.loans.filter(l => l.turnsRemaining <= 0);
        dueLoans.forEach(loan => {
            const totalDue = loan.amount + Math.floor(loan.amount * loan.interestRate);
            const actualPaid = Math.min(totalDue, player.cash + player.deposit);
            if (actualPaid >= totalDue) {
                // 足额还款
                if (player.cash >= totalDue) {
                    player.cash -= totalDue;
                }
                else {
                    player.deposit -= (totalDue - player.cash);
                    player.cash = 0;
                }
                sendMessage(room, 'success', `${player.name} 还清贷款 $${totalDue}（含 ${Math.floor(loan.amount * loan.interestRate)} 利息）`);
            }
            else {
                // 不足额，破产
                player.isBankrupt = true;
                player.properties.forEach(propId => {
                    room.cells[propId].owner = null;
                    room.cells[propId].level = 0;
                });
                sendMessage(room, 'error', `${player.name} 贷款到期无法偿还，破产!`);
            }
        });
        // 移除已还清的贷款
        player.loans = player.loans.filter(l => l.turnsRemaining > 0);
    });
}
// ============ Check Win Condition ============
// 胜利条件：第一个总资产达到目标（默认1亿）的玩家赢（适用于单人和多人模式）
function checkSingleplayerWin(room) {
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer)
        return false;
    // 多人模式下，AI 不参与胜利检测（避免最后一个 AI 触发误结束）
    if (room.mode === 'multiplayer' && currentPlayer.isAI)
        return false;
    const assets = calculateAssets(currentPlayer, room);
    const target = room.targetAssets || 100_000_000;
    if (assets >= target) {
        room.phase = 'ended';
        room.winnerId = currentPlayer.id;
        sendMessage(room, 'success', `🎉 ${currentPlayer.name} 总资产达到 $${assets.toLocaleString()}，达成亿万富翁目标！获得最终胜利！`);
        sendMessage(room, 'info', `游戏共进行 ${room.currentTurn} 回合`);
        broadcastRoomState(room);
        return true;
    }
    return false;
}
// ============ Next Player ============
// 每日结算：处理特殊升级（酒店/冶炼场/钻石矿/房产中介/度假区/购物中心/地标）的回合收益
function processSpecialUpgrades(room) {
    const messages = [];
    room.players.forEach(player => {
        if (player.isBankrupt)
            return;
        let diamondBonus = 0;
        let preciousBonus = 0;
        let depositInterest = 0;
        let cashBonus = 0;
        let attractionBonus = 0;
        player.properties.forEach(cellId => {
            const cell = room.cells[cellId];
            if (!cell || !cell.upgrade || cell.upgrade === 'normal')
                return;
            if (cell.upgrade === 'hotel') {
                // 酒店：每回合按存款 5% 给利息
                depositInterest += Math.floor(player.deposit * 0.05);
            }
            else if (cell.upgrade === 'smelter') {
                // 冶炼场：每回合 2 贵金属
                preciousBonus += 2;
            }
            else if (cell.upgrade === 'diamondMine') {
                // 钻石矿：每回合 2 钻石
                diamondBonus += 2;
            }
            else if (cell.upgrade === 'resort') {
                // 度假区：每回合 $1000 现金
                cashBonus += 1000;
            }
            else if (cell.upgrade === 'mall') {
                // 购物中心：每回合 $500 现金 + 1 💎
                cashBonus += 500;
                diamondBonus += 1;
            }
            else if (cell.upgrade === 'monument') {
                // 地标：每回合 +5 吸引力（同时是吸引力的来源）
                attractionBonus += 5;
            }
        });
        if (depositInterest > 0) {
            player.deposit += depositInterest;
            messages.push(`🏨 ${player.name} 的酒店收益 +$${depositInterest.toLocaleString()} 利息`);
        }
        if (preciousBonus > 0) {
            player.materials.preciousMetals += preciousBonus;
            messages.push(`🔥 ${player.name} 的冶炼场产出 +${preciousBonus} 贵金属`);
        }
        if (diamondBonus > 0) {
            player.diamonds += diamondBonus;
            messages.push(`⛏️ ${player.name} 的钻石矿/购物中心产出 +${diamondBonus} 💎`);
        }
        if (cashBonus > 0) {
            player.cash += cashBonus;
            messages.push(`🏖️ ${player.name} 的度假区/购物中心收入 +$${cashBonus.toLocaleString()}`);
        }
        if (attractionBonus > 0) {
            player.attraction = (player.attraction || 0) + attractionBonus;
            messages.push(`🏛️ ${player.name} 的地标建筑产出 +${attractionBonus} 吸引力`);
        }
    });
    messages.forEach(m => sendMessage(room, 'info', m));
}
function nextPlayer(room) {
    room.players = room.players.filter(p => !p.isBankrupt);
    if (room.mode === 'multiplayer') {
        if (room.players.length <= 1) {
            room.phase = 'ended';
            const winner = room.players[0];
            if (winner) {
                room.winnerId = winner.id;
                sendMessage(room, 'success', `${winner.name} 获得胜利!`);
            }
            broadcastRoomState(room);
            return;
        }
    }
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (currentPlayer?.isBankrupt) {
        nextPlayer(room);
        return;
    }
    room.diceValue = null;
    room.forcedDice = null;
    room.turnStartedAt = Date.now();
    if (currentPlayer?.stayTurns && currentPlayer.stayTurns > 0) {
        currentPlayer.stayTurns--;
        room.stayCurrentTurn = true;
        sendMessage(room, 'info', `${currentPlayer.name} 被停留卡影响，本回合无法行动`);
    }
    else {
        room.stayCurrentTurn = false;
    }
    if (room.currentPlayerIndex === 0) {
        room.currentTurn++;
        room.gameDate = addDays(room.gameDate, 1);
        // 通货膨胀：每月（每30天）8%，按当前 basePrice 调整地皮价格
        if (room.currentTurn % 30 === 0) {
            room.cells.forEach(c => {
                if (c.type === 'empty' && c.basePrice > 0) {
                    c.basePrice = Math.floor(c.basePrice * 1.08);
                    c.price = Math.floor(c.basePrice * (1 + (c.level || 0) * 0.5));
                }
            });
            sendMessage(room, 'warning', '📈 通货膨胀！所有地皮价格上涨 8%');
        }
        // 拍卖系统：每7天结束当前拍卖并启动新一轮
        if (room.currentTurn % 7 === 0) {
            finalizeAuction(room);
            setTimeout(() => startNewAuction(room), 200);
        }
        processLoans(room);
        processSpecialUpgrades(room);
        updateStockPrices(room);
        updateFuturesPrices(room);
        checkMarginCall(room);
        checkFuturesMarginCalls(room);
    }
    broadcastRoomState(room);
    if (room.phase === 'playing' && currentPlayer?.isAI) {
        setTimeout(() => aiTurn(room, currentPlayer), 1200);
    }
}
// ============ AI ============
function aiTurn(room, player) {
    if (room.phase !== 'playing')
        return;
    if (room.players[room.currentPlayerIndex]?.id !== player.id)
        return;
    const difficulty = player.aiDifficulty || 'easy';
    let dice = Math.floor(Math.random() * 6) + 1;
    if (difficulty === 'hard' && room.forcedDice !== null) {
        dice = room.forcedDice;
        room.forcedDice = null;
    }
    room.diceValue = dice;
    const newPosition = (player.position + dice) % TOTAL_CELLS;
    const passedStart = newPosition < player.position;
    player.position = newPosition;
    sendMessage(room, 'info', `🤖 ${player.name} 投出 ${dice}，移动到 ${room.cells[newPosition].name}`);
    if (passedStart) {
        player.cash += START_BONUS;
        sendMessage(room, 'info', `🤖 ${player.name} 经过起点，获得 $${START_BONUS}`);
    }
    processCellEvent(room, player);
    broadcastRoomState(room);
    // 购买地块
    setTimeout(() => {
        if (room.phase !== 'playing')
            return;
        if (room.players[room.currentPlayerIndex]?.id !== player.id)
            return;
        const cell = room.cells[player.position];
        if (cell.type === 'empty' && !cell.owner && player.cash >= cell.price) {
            let buyChance = 0.5;
            if (difficulty === 'easy')
                buyChance = 0.3;
            if (difficulty === 'hard')
                buyChance = 0.8;
            if (Math.random() < buyChance) {
                player.cash -= cell.price;
                cell.owner = player.id;
                player.properties.push(cell.id);
                sendMessage(room, 'success', `🤖 ${player.name} 购买了 ${cell.name}，花费 $${cell.price}`);
                broadcastRoomState(room);
            }
        }
        setTimeout(() => {
            if (room.phase !== 'playing')
                return;
            if (room.players[room.currentPlayerIndex]?.id !== player.id)
                return;
            if (difficulty !== 'easy' && player.properties.length > 0) {
                for (const propId of player.properties) {
                    const propCell = room.cells[propId];
                    if (propCell.level < 4 && player.cash >= Math.floor(propCell.basePrice * 0.5)) {
                        // 检查建材
                        const matCost = UPGRADE_MATERIAL_COST[propCell.level];
                        if (matCost && player.materials.cement >= matCost.cement &&
                            player.materials.steel >= matCost.steel &&
                            player.materials.rubber >= matCost.rubber) {
                            if (Math.random() < 0.4) {
                                player.cash -= Math.floor(propCell.basePrice * 0.5);
                                player.materials.cement -= matCost.cement;
                                player.materials.steel -= matCost.steel;
                                player.materials.rubber -= matCost.rubber;
                                propCell.level++;
                                propCell.price = Math.floor(propCell.basePrice * (1 + propCell.level * 0.5));
                                sendMessage(room, 'success', `🤖 ${player.name} 将 ${propCell.name} 升级到 Lv.${propCell.level}`);
                                broadcastRoomState(room);
                                break;
                            }
                        }
                    }
                }
            }
            setTimeout(() => {
                if (room.phase !== 'playing')
                    return;
                if (room.players[room.currentPlayerIndex]?.id !== player.id)
                    return;
                nextPlayer(room);
            }, 800);
        }, 600);
    }, 800);
}
// ============ Socket Handlers ============
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    let currentRoom = null;
    // 创建新玩家（含建材/同花顺等新字段）
    function makePlayer(id, socketId, name, color, isAI, difficulty) {
        return {
            id, socketId, name, color,
            cash: INITIAL_CASH,
            deposit: INITIAL_DEPOSIT,
            diamonds: INITIAL_DIAMONDS,
            position: 0,
            properties: [],
            isBankrupt: false,
            cards: [],
            stocks: [],
            loans: [],
            passedBank: false,
            stayTurns: 0,
            isAI,
            aiDifficulty: difficulty,
            // 建材库存（每人初始给少量）
            materials: { cement: 10, steel: 5, rubber: 2, preciousMetals: 0, diamonds: 0 },
            // 默认未购买同花顺
            hasTonghuashun: false,
            atStockExchange: false,
            atFuturesExchange: false,
            attraction: 0
        };
    }
    socket.on('createRoom', ({ playerName, maxPlayers = 4 }) => {
        const code = generateRoomCode();
        const safeMax = Math.max(2, Math.min(6, maxPlayers));
        const room = {
            code,
            mode: 'multiplayer',
            players: [makePlayer(socket.id, socket.id, playerName, PLAYER_COLORS[0], false)],
            cells: generateCells(),
            stocks: generateStocks(),
            futures: generateFutures().map(f => ({ ...f, expiresOnDay: 1 + f.expiresInDays })),
            currentPlayerIndex: 0,
            currentTurn: 1,
            phase: 'lobby',
            diceValue: null,
            forcedDice: null,
            stayCurrentTurn: false,
            targetAssets: 100_000_000, // 多人胜利目标：第一个到1亿者获胜
            maxPlayers: safeMax,
            winnerId: null,
            turnStartedAt: Date.now(),
            gameDate: todayString()
        };
        rooms.set(code, room);
        socket.join(code);
        currentRoom = room;
        socket.emit('roomCreated', { roomCode: code, playerId: socket.id });
        broadcastRoomState(room);
    });
    socket.on('createSingleplayer', ({ playerName, aiCount = 3, difficulty = 'normal' }) => {
        const code = generateRoomCode();
        const humanPlayer = makePlayer(socket.id, socket.id, playerName || '玩家', PLAYER_COLORS[0], false);
        const players = [humanPlayer];
        const aiPool = difficulty === 'easy' ? AI_NAMES_EASY : difficulty === 'hard' ? AI_NAMES_HARD : AI_NAMES_NORMAL;
        for (let i = 0; i < aiCount && i < 5; i++) {
            players.push(makePlayer(`ai_${code}_${i}`, '', aiPool[i % aiPool.length], PLAYER_COLORS[i + 1], true, difficulty));
        }
        const room = {
            code,
            mode: 'singleplayer',
            players,
            cells: generateCells(),
            stocks: generateStocks(),
            futures: generateFutures().map(f => ({ ...f, expiresOnDay: 1 + f.expiresInDays })),
            currentPlayerIndex: 0,
            currentTurn: 1,
            phase: 'playing',
            diceValue: null,
            forcedDice: null,
            stayCurrentTurn: false,
            targetAssets: SINGLEPLAYER_TARGET,
            maxPlayers: players.length,
            winnerId: null,
            turnStartedAt: Date.now(),
            gameDate: todayString()
        };
        rooms.set(code, room);
        socket.join(code);
        currentRoom = room;
        socket.emit('roomCreated', { roomCode: code, playerId: socket.id });
        sendMessage(room, 'info', `欢迎来到单人模式！目标：总资产达到 $${SINGLEPLAYER_TARGET.toLocaleString()}`);
        sendMessage(room, 'info', `你将面对 ${aiCount} 个 AI 对手`);
        sendMessage(room, 'success', `游戏开始！${players[0].name} 先手`);
        broadcastRoomState(room);
    });
    socket.on('joinRoom', ({ playerName, roomCode }) => {
        const room = rooms.get(roomCode);
        if (!room) {
            socket.emit('error', { message: '房间不存在' });
            return;
        }
        if (room.phase !== 'lobby') {
            socket.emit('error', { message: '游戏已开始' });
            return;
        }
        if (room.mode === 'singleplayer') {
            socket.emit('error', { message: '单人模式房间不能加入' });
            return;
        }
        if (room.players.length >= (room.maxPlayers || 6)) {
            socket.emit('error', { message: `房间已满（最多 ${room.maxPlayers || 6} 人）` });
            return;
        }
        const player = makePlayer(socket.id, socket.id, playerName, PLAYER_COLORS[room.players.length], false);
        room.players.push(player);
        socket.join(roomCode);
        currentRoom = room;
        socket.emit('roomJoined', { roomCode, playerId: socket.id });
        sendMessage(room, 'info', `${playerName} 加入了游戏`);
        broadcastRoomState(room);
    });
    socket.on('startGame', () => {
        if (!currentRoom)
            return;
        if (currentRoom.mode === 'singleplayer')
            return;
        if (currentRoom.players.length < 2) {
            socket.emit('error', { message: '至少需要 2 名玩家' });
            return;
        }
        currentRoom.phase = 'playing';
        currentRoom.currentPlayerIndex = Math.floor(Math.random() * currentRoom.players.length);
        sendMessage(currentRoom, 'info', `游戏开始! ${currentRoom.players[currentRoom.currentPlayerIndex].name} 先手`);
        broadcastRoomState(currentRoom);
    });
    socket.on('rollDice', () => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (currentRoom.diceValue !== null) {
            socket.emit('error', { message: '已经投过骰子了' });
            return;
        }
        if (currentRoom.stayCurrentTurn) {
            nextPlayer(currentRoom);
            return;
        }
        let diceValue;
        if (currentRoom.forcedDice !== null) {
            diceValue = currentRoom.forcedDice;
            currentRoom.forcedDice = null;
        }
        else {
            diceValue = Math.floor(Math.random() * 6) + 1;
        }
        currentRoom.diceValue = diceValue;
        const newPosition = (currentPlayer.position + diceValue) % TOTAL_CELLS;
        const passedStart = newPosition < currentPlayer.position;
        currentPlayer.position = newPosition;
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 投出 ${diceValue}，移动到 ${currentRoom.cells[newPosition].name}`);
        if (passedStart) {
            currentPlayer.cash += START_BONUS;
            sendMessage(currentRoom, 'info', `${currentPlayer.name} 经过起点，获得 $${START_BONUS}`);
        }
        processCellEvent(currentRoom, currentPlayer);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer') {
            checkSingleplayerWin(currentRoom);
        }
    });
    socket.on('endTurn', () => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (currentRoom.diceValue === null && !currentRoom.stayCurrentTurn) {
            socket.emit('error', { message: '请先投骰子' });
            return;
        }
        nextPlayer(currentRoom);
    });
    // ============ 购买地块 ============
    socket.on('buyProperty', ({ cellId }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cell = currentRoom.cells[cellId];
        if (!cell || cell.type !== 'empty' || cell.owner) {
            socket.emit('error', { message: '无法购买此地块' });
            return;
        }
        if (currentPlayer.cash < cell.price) {
            socket.emit('error', { message: '现金不足' });
            return;
        }
        currentPlayer.cash -= cell.price;
        cell.owner = currentPlayer.id;
        cell.visitCount = 1; // 购买时算第一次到
        currentPlayer.properties.push(cellId);
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 购买了 ${cell.name}，花费 $${cell.price}`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 出售自有地皮 ============
    // 在房地产交易中心（realestate，cell.id === 32）上，玩家可以出售自己的任意一块地皮换取现金
    // 价格计算：基础售价 × (1 + 等级 × 0.5) × 0.7  = 70% 回收率
    // 出售后：level=0, owner=null, visitCount=0, upgrade=undefined, fromAuction=false
    socket.on('sellProperty', ({ cellId }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        // 必须站在房地产交易中心
        const standingCell = currentRoom.cells[currentPlayer.position];
        if (!standingCell || standingCell.type !== 'realestate') {
            socket.emit('error', { message: '需在房地产交易中心才能出售地皮' });
            return;
        }
        const cell = currentRoom.cells[cellId];
        if (!cell || cell.owner !== currentPlayer.id) {
            socket.emit('error', { message: '只能出售自己的地皮' });
            return;
        }
        // 不允许出售正在拍卖中的地块
        if (cell.auctionActive) {
            socket.emit('error', { message: '该地块正在拍卖，无法出售' });
            return;
        }
        // 计算回收金额：basePrice × (1 + level × 0.5) × 0.7
        // 拍卖地 100% 回收（含拍买溢价）
        const levelMultiplier = 1 + cell.level * 0.5;
        const recoveryRate = cell.fromAuction ? 1.0 : 0.7;
        const salePrice = Math.max(Math.floor(cell.basePrice * levelMultiplier * recoveryRate), Math.floor(cell.basePrice * 0.5) // 保底：至少能回收 50% 基础价
        );
        // 给现金
        currentPlayer.cash += salePrice;
        // 清除地皮状态：变回空地
        cell.owner = null;
        cell.level = 0;
        cell.price = cell.basePrice;
        cell.visitCount = 0;
        cell.upgrade = undefined;
        cell.fromAuction = false;
        // 从玩家 properties 中移除
        currentPlayer.properties = currentPlayer.properties.filter(id => id !== cellId);
        sendMessage(currentRoom, 'success', `🏪 ${currentPlayer.name} 在房地产交易中心出售了 ${cell.name}（${cell.level >= 1 ? `${cell.level}级` : '空地'}），获得 $${salePrice.toLocaleString()}`);
        broadcastRoomState(currentRoom);
    });
    // ============ 升级地块 ============
    socket.on('upgradeProperty', ({ cellId }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cell = currentRoom.cells[cellId];
        if (!cell || cell.owner !== currentPlayer.id) {
            socket.emit('error', { message: '无法升级此地块' });
            return;
        }
        if (cell.level >= 4) {
            socket.emit('error', { message: '已达最高等级，请使用 specialUpgrade 选择特殊升级方式' });
            return;
        }
        // 第二次到同一块地才能升级（visitCount >= 2）；拍卖地皮无此限制
        const visits = cell.visitCount || 0;
        if (!cell.fromAuction && visits < 2) {
            socket.emit('error', { message: `需要再次到达此地才能升级（已到 ${visits} 次，需要 2 次）` });
            return;
        }
        // 升级费用：现金 + 建材（拍卖地皮费用/建材全部减半，可直接升级到顶级，无次数限制）
        const nextLevel = cell.level + 1;
        const matCost = UPGRADE_MATERIAL_COST[cell.level];
        const discount = cell.fromAuction ? 0.5 : 1;
        const cashCost = Math.floor(cell.basePrice * 0.5 * discount);
        const discountedMat = {
            cement: Math.ceil(matCost.cement * discount),
            steel: Math.ceil(matCost.steel * discount),
            rubber: Math.ceil(matCost.rubber * discount),
        };
        if (!matCost) {
            socket.emit('error', { message: '升级配置错误' });
            return;
        }
        if (currentPlayer.cash + currentPlayer.deposit < cashCost) {
            socket.emit('error', { message: `现金+存款不足 $${cashCost}` });
            return;
        }
        if (currentPlayer.materials.cement < discountedMat.cement ||
            currentPlayer.materials.steel < discountedMat.steel ||
            currentPlayer.materials.rubber < discountedMat.rubber) {
            socket.emit('error', {
                message: `建材不足！需要 水泥×${discountedMat.cement} 钢材×${discountedMat.steel} 橡胶×${discountedMat.rubber}${discount < 1 ? '（拍卖地皮，建材减半）' : '（可在期货市场兑换）'}`
            });
            return;
        }
        // 扣现金 + 建材
        deductFunds(currentPlayer, cashCost, 'auto');
        currentPlayer.materials.cement -= discountedMat.cement;
        currentPlayer.materials.steel -= discountedMat.steel;
        currentPlayer.materials.rubber -= discountedMat.rubber;
        cell.level = nextLevel;
        cell.price = Math.floor(cell.basePrice * (1 + cell.level * 0.5));
        // 升级后重置访问计数
        cell.visitCount = 0;
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 将 ${cell.name} 升级到 Lv.${cell.level}（$${cashCost} + 水泥×${discountedMat.cement} 钢材×${discountedMat.steel} 橡胶×${discountedMat.rubber}${discount < 1 ? '，拍卖地皮减半' : ''}）`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 特殊升级（顶级之后） ============
    socket.on('specialUpgrade', ({ cellId, type }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cell = currentRoom.cells[cellId];
        if (!cell || cell.owner !== currentPlayer.id) {
            socket.emit('error', { message: '无法升级此地块' });
            return;
        }
        if (cell.level < 4) {
            socket.emit('error', { message: '需要先将地皮升级到顶级 (Lv.4) 才能选择特殊升级' });
            return;
        }
        if (cell.upgrade && cell.upgrade !== 'normal') {
            socket.emit('error', { message: '该地皮已进行过特殊升级' });
            return;
        }
        const cost = SPECIAL_UPGRADE_COST[type];
        if (!cost) {
            socket.emit('error', { message: '未知的升级类型' });
            return;
        }
        // 拍卖地皮：特殊升级费用/建材全部减半；吸引力也减半
        const discount = cell.fromAuction ? 0.5 : 1;
        const discountedCost = {
            cash: Math.floor(cost.cash * discount),
            cement: Math.ceil(cost.cement * discount),
            steel: Math.ceil(cost.steel * discount),
            rubber: Math.ceil(cost.rubber * discount),
            preciousMetals: Math.ceil(cost.preciousMetals * discount),
            attraction: Math.ceil(cost.attraction * discount),
        };
        // 校验资源
        if (currentPlayer.cash + currentPlayer.deposit < discountedCost.cash) {
            socket.emit('error', { message: `现金+存款不足 $${discountedCost.cash.toLocaleString()}${discount < 1 ? '（拍卖地皮半价）' : ''}` });
            return;
        }
        if (currentPlayer.materials.cement < discountedCost.cement ||
            currentPlayer.materials.steel < discountedCost.steel ||
            currentPlayer.materials.rubber < discountedCost.rubber ||
            currentPlayer.materials.preciousMetals < discountedCost.preciousMetals) {
            socket.emit('error', {
                message: `建材不足：需要 水泥×${discountedCost.cement} 钢材×${discountedCost.steel} 橡胶×${discountedCost.rubber} 贵金属×${discountedCost.preciousMetals}${discount < 1 ? '（拍卖地皮半价）' : ''}`
            });
            return;
        }
        if ((currentPlayer.attraction || 0) < discountedCost.attraction) {
            socket.emit('error', {
                message: `吸引力不足：需要 ${discountedCost.attraction} 吸引力，当前 ${currentPlayer.attraction || 0}（吸引力可在期货交易所获取，或拥有地标建筑每回合产出）`
            });
            return;
        }
        // 扣款
        deductFunds(currentPlayer, discountedCost.cash, 'auto');
        currentPlayer.materials.cement -= discountedCost.cement;
        currentPlayer.materials.steel -= discountedCost.steel;
        currentPlayer.materials.rubber -= discountedCost.rubber;
        currentPlayer.materials.preciousMetals -= discountedCost.preciousMetals;
        currentPlayer.attraction = (currentPlayer.attraction || 0) - discountedCost.attraction;
        cell.upgrade = type;
        const names = {
            hotel: '🏨 酒店',
            smelter: '🔥 贵金属冶炼场',
            diamondMine: '⛏️ 钻石开采场',
            agency: '🏢 房产中介',
            resort: '🏖️ 度假区',
            mall: '🛍️ 购物中心',
            monument: '🏛️ 地标建筑'
        };
        const costDetail = [
            `$${discountedCost.cash.toLocaleString()}`,
            discountedCost.cement && `水泥×${discountedCost.cement}`,
            discountedCost.steel && `钢材×${discountedCost.steel}`,
            discountedCost.rubber && `橡胶×${discountedCost.rubber}`,
            discountedCost.preciousMetals && `贵金属×${discountedCost.preciousMetals}`,
            discountedCost.attraction && `吸引力×${discountedCost.attraction}`,
        ].filter(Boolean).join(' + ');
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 将 ${cell.name} 升级为 [${names[type]}]！（花费 ${costDetail}${discount < 1 ? '，拍卖地皮半价' : ''}）`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 银行操作（必须经过银行） ============
    socket.on('bankDeposit', ({ amount }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (!currentPlayer.passedBank) {
            socket.emit('error', { message: '只有站在银行地块才能存款' });
            return;
        }
        if (amount <= 0) {
            socket.emit('error', { message: '金额必须大于0' });
            return;
        }
        if (currentPlayer.cash < amount) {
            socket.emit('error', { message: '现金不足' });
            return;
        }
        const fee = Math.floor(amount * BANK_FEE_RATE);
        currentPlayer.cash -= (amount + fee);
        currentPlayer.deposit += amount;
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 存款 $${amount}（手续费 $${fee}）`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    socket.on('bankWithdraw', ({ amount }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (!currentPlayer.passedBank) {
            socket.emit('error', { message: '只有站在银行地块才能取款' });
            return;
        }
        if (amount <= 0) {
            socket.emit('error', { message: '金额必须大于0' });
            return;
        }
        if (currentPlayer.deposit < amount) {
            socket.emit('error', { message: '存款不足' });
            return;
        }
        const fee = Math.floor(amount * BANK_FEE_RATE);
        currentPlayer.deposit -= amount;
        currentPlayer.cash += (amount - fee);
        sendMessage(currentRoom, 'info', `${currentPlayer.name} 取款 $${amount}（手续费 $${fee}）`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    socket.on('bankConvert', ({ action, amount }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (!currentPlayer.passedBank) {
            socket.emit('error', { message: '只有站在银行地块才能使用此功能' });
            return;
        }
        if (amount <= 0) {
            socket.emit('error', { message: '金额必须大于0' });
            return;
        }
        if (action === 'cashToDeposit') {
            if (currentPlayer.cash < amount) {
                socket.emit('error', { message: '现金不足' });
                return;
            }
            const fee = Math.floor(amount * BANK_FEE_RATE);
            currentPlayer.cash -= (amount + fee);
            currentPlayer.deposit += amount;
            sendMessage(currentRoom, 'info', `${currentPlayer.name} 将 $${amount} 转为存款（手续费 $${fee}）`);
        }
        else {
            if (currentPlayer.deposit < amount) {
                socket.emit('error', { message: '存款不足' });
                return;
            }
            const fee = Math.floor(amount * BANK_FEE_RATE);
            currentPlayer.deposit -= amount;
            currentPlayer.cash += (amount - fee);
            sendMessage(currentRoom, 'info', `${currentPlayer.name} 将 $${amount} 转为现金（手续费 $${fee}）`);
        }
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 新贷款系统 ============
    socket.on('takeLoan', ({ amount }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (!currentPlayer.passedBank) {
            socket.emit('error', { message: '只有站在银行地块才能贷款' });
            return;
        }
        if (currentPlayer.properties.length === 0) {
            socket.emit('error', { message: '至少需要 1 块地皮才能贷款' });
            return;
        }
        const maxLoan = getMaxLoan(currentPlayer, currentRoom.cells);
        if (amount <= 0 || amount > maxLoan) {
            socket.emit('error', { message: `可贷额度 $${maxLoan.toLocaleString()}（房产估值 $${Math.floor(maxLoan / 10).toLocaleString()}×10）` });
            return;
        }
        const loan = {
            id: `loan_${Date.now()}_${Math.random()}`,
            amount,
            interestRate: LOAN_INTEREST_RATE,
            turnsRemaining: LOAN_TURNS_UNTIL_DUE,
            createdAt: Date.now()
        };
        currentPlayer.loans.push(loan);
        currentPlayer.cash += amount;
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 贷款 $${amount}（月利率 ${LOAN_INTEREST_RATE * 100}%，${LOAN_TURNS_UNTIL_DUE}回合后到期，可随时还款）`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    socket.on('repayLoan', ({ loanId }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const loanIndex = currentPlayer.loans.findIndex(l => l.id === loanId);
        if (loanIndex === -1) {
            socket.emit('error', { message: '贷款不存在' });
            return;
        }
        const loan = currentPlayer.loans[loanIndex];
        // 利息按经过回合数计算（每天按月利率/30计算）
        const daysElapsed = LOAN_TURNS_UNTIL_DUE - loan.turnsRemaining;
        const interest = Math.floor(loan.amount * loan.interestRate * Math.min(daysElapsed, LOAN_TURNS_UNTIL_DUE) / LOAN_TURNS_UNTIL_DUE);
        const totalDue = loan.amount + interest;
        // 先用现金，不足部分从存款扣
        if (currentPlayer.cash + currentPlayer.deposit < totalDue) {
            socket.emit('error', { message: `资金不足，需 $${totalDue.toLocaleString()}（现金+存款）` });
            return;
        }
        let fromCash = Math.min(currentPlayer.cash, totalDue);
        let remaining = totalDue - fromCash;
        currentPlayer.cash -= fromCash;
        if (remaining > 0) {
            currentPlayer.deposit -= remaining;
        }
        currentPlayer.loans.splice(loanIndex, 1);
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 提前还清贷款 $${totalDue}（本金 $${loan.amount} + 利息 $${interest}，使用 ${daysElapsed}天）`);
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 卡片 ============
    socket.on('buyCard', ({ cardName }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cardPrices = {
            '停留卡': 40, '骰子卡': 30, '均贫卡': 100,
            '红心卡': 60, '黑心卡': 80, '占地卡': 120, '地皮升级卡': 60,
            '护盾卡': 100, '谣言卡': 50
        };
        const price = cardPrices[cardName];
        if (!price) {
            socket.emit('error', { message: '无效的卡片' });
            return;
        }
        if (currentPlayer.diamonds < price) {
            socket.emit('error', { message: '钻石不足' });
            return;
        }
        currentPlayer.diamonds -= price;
        currentPlayer.cards.push(cardName);
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 购买了 ${cardName}`);
        broadcastRoomState(currentRoom);
    });
    socket.on('useCard', ({ cardName, target }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cardIndex = currentPlayer.cards.indexOf(cardName);
        if (cardIndex === -1) {
            socket.emit('error', { message: '没有这张卡片' });
            return;
        }
        currentPlayer.cards.splice(cardIndex, 1);
        // 限制：在股票/期货交易所时，只能使用谣言卡（其它卡片都不能用）
        const atExchange = currentPlayer.atStockExchange || currentPlayer.atFuturesExchange;
        if (atExchange && cardName !== '谣言卡') {
            socket.emit('error', { message: '在交易所内不能使用卡片（仅可在交易所散布谣言卡）' });
            currentPlayer.cards.push(cardName); // 退还
            return;
        }
        switch (cardName) {
            case '停留卡':
                if (currentRoom.diceValue !== null) {
                    socket.emit('error', { message: '回合已开始，无法使用停留卡' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const targetPlayerIndex = (currentRoom.currentPlayerIndex + 1) % currentRoom.players.length;
                currentRoom.players[targetPlayerIndex].stayTurns++;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 使用停留卡，${currentRoom.players[targetPlayerIndex].name} 下回合停留`);
                break;
            case '骰子卡':
                if (typeof target !== 'number' || target < 1 || target > 6) {
                    socket.emit('error', { message: '骰子点数必须在1-6之间' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                currentRoom.forcedDice = target;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 使用骰子卡，下一次投出 ${target} 点`);
                break;
            case '均贫卡':
                const totalCash = currentRoom.players.reduce((sum, p) => sum + (p.isBankrupt ? 0 : p.cash), 0);
                const avgCash = Math.floor(totalCash / currentRoom.players.filter(p => !p.isBankrupt).length);
                currentRoom.players.forEach(p => {
                    if (!p.isBankrupt) {
                        p.cash = avgCash;
                    }
                });
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 使用均贫卡，所有玩家现金变为 $${avgCash}`);
                break;
            case '谣言卡': {
                // 谣言卡：对某只股票散布利好/利空消息，引诱其他玩家交易
                // 限制：必须在股票交易所（有同花顺则可在任意位置）；不能作用于期货
                if (!currentPlayer.hasTonghuashun && !currentPlayer.atStockExchange) {
                    socket.emit('error', { message: '需在股票交易所或购买同花顺软件才能散布谣言' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                // target 格式：`${symbol}:${direction}`，direction 为 'good' 或 'bad'
                const targetStr = String(target || '');
                const [targetSymbol, direction] = targetStr.split(':');
                if (!targetSymbol || (direction !== 'good' && direction !== 'bad')) {
                    socket.emit('error', { message: '请选择目标股票及利好/利空方向' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                // 找到目标（仅股票）
                const rumorStock = currentRoom.stocks.find(s => s.symbol === targetSymbol);
                if (!rumorStock) {
                    socket.emit('error', { message: '谣言卡仅能作用于股票（不支持期货）' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const tgt = rumorStock;
                const typeLabel = '股票';
                // 谣言效果：设置事件影响（中等强度，4-7 天）
                const rumorDuration = 4 + Math.floor(Math.random() * 4); // 4-7 天
                // 股票：利好/利空 → 触发 base 偏移
                rumorStock.eventEffect = direction === 'good' ? 1.15 : 0.85;
                rumorStock.eventDays = rumorDuration;
                rumorStock.eventDesc = direction === 'good' ? '🟢 谣言利好（散户跟风）' : '🔴 谣言利空（散户恐慌）';
                rumorStock.news = direction === 'good'
                    ? `📰 [谣言] ${rumorStock.name} 传闻业绩大超预期，机构资金流入`
                    : `📰 [谣言] ${rumorStock.name} 传闻遭遇重大利空，机构资金撤离`;
                // 游戏内广播（仅提示"有谣言"，不显示内容）
                sendMessage(currentRoom, 'warning', `📢 ${currentPlayer.name} 使用谣言卡，对 ${tgt.name}（${typeLabel}）散布了${direction === 'good' ? '利好' : '利空'}消息！`);
                // 私密提示：消息内容只对站在交易所或有同花顺的玩家可见
                // （通过现有的 news 机制，前端根据 canViewNews 判断）
                socket.emit('rumorReport', {
                    targetSymbol: tgt.symbol,
                    targetName: tgt.name,
                    targetType: typeLabel,
                    direction,
                    eventDays: rumorDuration,
                    newsContent: tgt.news,
                    hint: '该消息需前往股票/期货交易所或购买同花顺软件查看详情'
                });
                break;
            }
            case '红心卡': {
                // 1. 找到目标（仅股票）
                const upStock = currentRoom.stocks.find(s => s.symbol === target);
                if (!upStock) {
                    socket.emit('error', { message: '红心卡仅能作用于股票（不支持期货）' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const tgt = upStock;
                const typeLabel = '股票';
                // 0. 护盾检测：目标已被护盾保护
                if (tgt.cardBiasShield) {
                    tgt.cardBiasShield = false;
                    sendMessage(currentRoom, 'warning', `🛡️ ${tgt.name} 的护盾生效，${currentPlayer.name} 的红心卡无效！`);
                    // 不退还卡牌（仍消耗）
                    break;
                }
                // 2. 冷却检查：同一目标 7 天内不能重复使用
                const lastUse = tgt.cardBiasLastUsedTurn ?? -999;
                if (currentRoom.currentTurn - lastUse < 7) {
                    socket.emit('error', { message: `该${typeLabel}7天内已受卡片影响，请等待冷却` });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                // 3. 叠加衰减：后用效果 ×0.7
                const newBias = 0.5;
                tgt.cardBias = (tgt.cardBias ?? 0) >= 0
                    ? Math.max(tgt.cardBias ?? 0, newBias * 0.7)
                    : newBias; // 若当前是负偏置（被黑心），则被红心覆盖
                tgt.cardBiasDays = 4;
                tgt.cardBiasLastUsedTurn = currentRoom.currentTurn;
                sendMessage(currentRoom, 'success', `❤ ${currentPlayer.name} 使用红心卡，${tgt.name} 散户/机构/游资/量化概率看多 +25%（持续4天，不影响操盘手）`);
                break;
            }
            case '黑心卡': {
                const downStock = currentRoom.stocks.find(s => s.symbol === target);
                if (!downStock) {
                    socket.emit('error', { message: '黑心卡仅能作用于股票（不支持期货）' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const tgt = downStock;
                const typeLabel = '股票';
                // 0. 护盾检测
                if (tgt.cardBiasShield) {
                    tgt.cardBiasShield = false;
                    sendMessage(currentRoom, 'warning', `🛡️ ${tgt.name} 的护盾生效，${currentPlayer.name} 的黑心卡无效！`);
                    break;
                }
                // 冷却检查
                const lastUse = tgt.cardBiasLastUsedTurn ?? -999;
                if (currentRoom.currentTurn - lastUse < 7) {
                    socket.emit('error', { message: `该${typeLabel}7天内已受卡片影响，请等待冷却` });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                // 叠加衰减
                const newBias = -0.6;
                tgt.cardBias = (tgt.cardBias ?? 0) <= 0
                    ? Math.min(tgt.cardBias ?? 0, newBias * 0.7)
                    : newBias; // 若当前是正偏置（被红心），则被黑心覆盖
                tgt.cardBiasDays = 5;
                tgt.cardBiasLastUsedTurn = currentRoom.currentTurn;
                sendMessage(currentRoom, 'warning', `🖤 ${currentPlayer.name} 使用黑心卡，${tgt.name} 散户/机构/游资/量化概率看空 +30%（持续5天，不影响操盘手）`);
                break;
            }
            case '护盾卡': {
                // 护盾卡：让自己持有的某股票1次免疫红心/黑心卡影响
                const shieldStock = currentRoom.stocks.find(s => s.symbol === target);
                if (!shieldStock) {
                    socket.emit('error', { message: '护盾卡仅能作用于股票（不支持期货）' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const tgt = shieldStock;
                const typeLabel = '股票';
                // 检查玩家是否持有该目标
                const h = currentPlayer.stocks.find(sh => sh.symbol === tgt.symbol);
                const heldQty = (h ? h.quantity : 0) - (h ? (h.shortQuantity || 0) : 0);
                if (heldQty <= 0) {
                    socket.emit('error', { message: `未持有${typeLabel}，无法使用护盾卡` });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                tgt.cardBiasShield = true;
                sendMessage(currentRoom, 'success', `🛡️ ${currentPlayer.name} 使用护盾卡，${tgt.name} 下次被卡牌影响时免疫（持续至下次受卡前）`);
                break;
            }
            case '地皮升级卡': {
                if (currentPlayer.properties.length === 0) {
                    socket.emit('error', { message: '你没有地皮' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const upgradeableProp = currentPlayer.properties
                    .map(id => currentRoom.cells[id])
                    .find(c => c.level < 4);
                if (!upgradeableProp) {
                    socket.emit('error', { message: '所有地皮都已满级' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                upgradeableProp.level++;
                upgradeableProp.price = Math.floor(upgradeableProp.basePrice * (1 + upgradeableProp.level * 0.5));
                sendMessage(currentRoom, 'success', `${currentPlayer.name} 使用地皮升级卡，${upgradeableProp.name} 升级到 Lv.${upgradeableProp.level}`);
                break;
            }
            case '占地卡': {
                // 占地卡：花 200 💎，抢占一块非顶级（Lv<4）且属于他人的地皮
                if ((currentPlayer.diamonds || 0) < 200) {
                    socket.emit('error', { message: `钻石不足（需 200 💎，当前 ${currentPlayer.diamonds || 0}）` });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const targetCells = currentRoom.cells.filter(c => c.type === 'empty' && c.owner && c.owner !== currentPlayer.id && (c.level || 0) < 4);
                if (targetCells.length === 0) {
                    socket.emit('error', { message: '没有可占用的非顶级地皮' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                const targetCell = targetCells[Math.floor(Math.random() * targetCells.length)];
                // 原主人失去
                const oldOwner = currentRoom.players.find(p => p.id === targetCell.owner);
                if (oldOwner) {
                    oldOwner.properties = oldOwner.properties.filter(id => id !== targetCell.id);
                }
                currentPlayer.diamonds -= 200;
                targetCell.owner = currentPlayer.id;
                targetCell.level = 0;
                targetCell.price = targetCell.basePrice;
                targetCell.visitCount = 0;
                if (!currentPlayer.properties.includes(targetCell.id))
                    currentPlayer.properties.push(targetCell.id);
                sendMessage(currentRoom, 'warning', `💎 ${currentPlayer.name} 使用占地卡（200💎），抢走了 ${oldOwner?.name || '无主'} 的 ${targetCell.name}！`);
                break;
            }
        }
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 股票交易 ============
    socket.on('tradeStock', ({ symbol, action, quantity, leverage }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const stock = currentRoom.stocks.find(s => s.symbol === symbol);
        if (!stock) {
            socket.emit('error', { message: '股票不存在' });
            return;
        }
        let holding = currentPlayer.stocks.find(s => s.symbol === symbol);
        if (!holding) {
            holding = { symbol, quantity: 0, avgCost: 0, shortQuantity: 0, shortAvgCost: 0, shortMarginFrozen: 0, shortCashReceived: 0 };
            currentPlayer.stocks.push(holding);
        }
        else {
            // 兼容旧数据
            if (holding.shortMarginFrozen === undefined)
                holding.shortMarginFrozen = 0;
            if (holding.shortCashReceived === undefined)
                holding.shortCashReceived = 0;
        }
        switch (action) {
            case 'buy':
                // 涨停不能买入
                if (stock.limitUp) {
                    socket.emit('error', { message: '该股票涨停，无法买入' });
                    return;
                }
                const buyCost = stock.price * quantity * leverage;
                // 股票买入只从存款扣（现金留给地皮交易）
                if (currentPlayer.deposit < buyCost) {
                    socket.emit('error', { message: `存款不足（需 $${buyCost.toLocaleString()}，请先到银行存款）` });
                    return;
                }
                currentPlayer.deposit -= buyCost;
                const newAvgCost = (holding.avgCost * holding.quantity + stock.price * quantity) / (holding.quantity + quantity);
                holding.avgCost = newAvgCost;
                holding.quantity += quantity;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 买入 ${quantity} 股 ${stock.name}（${leverage}x杠杆，$${buyCost.toLocaleString()}，存款扣款）`);
                break;
            case 'sell':
                // 跌停不能卖出
                if (stock.limitDown) {
                    socket.emit('error', { message: '该股票跌停，无法卖出' });
                    return;
                }
                if (holding.quantity < quantity) {
                    socket.emit('error', { message: '持有数量不足' });
                    return;
                }
                const sellValue = stock.price * quantity;
                const profit = (stock.price - holding.avgCost) * quantity;
                holding.quantity -= quantity;
                // 卖出的钱回到存款
                currentPlayer.deposit += sellValue;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 卖出 ${quantity} 股 ${stock.name}，${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}（钱已存入存款）`);
                if (holding.quantity === 0) {
                    holding.avgCost = 0;
                }
                break;
            case 'short':
                const notional = stock.price * quantity;
                const margin = Math.ceil(notional * SHORT_INITIAL_MARGIN_RATE);
                if (!deductFunds(currentPlayer, margin, 'deposit')) {
                    socket.emit('error', { message: `初始保证金不足（需存款 $${margin.toLocaleString()}）` });
                    return;
                }
                holding.shortAvgCost = (holding.shortAvgCost * holding.shortQuantity + stock.price * quantity) / (holding.shortQuantity + quantity);
                holding.shortQuantity += quantity;
                holding.shortMarginFrozen += margin;
                currentPlayer.cash += notional;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 做空 ${quantity} 股 ${stock.name}（初始保证金 $${margin}，维持保证金 $${Math.round(stock.price * holding.shortQuantity * SHORT_MAINTENANCE_RATE)}）`);
                break;
            case 'cover':
                if (holding.shortQuantity < quantity) {
                    socket.emit('error', { message: '做空数量不足' });
                    return;
                }
                const coverCost = stock.price * quantity;
                const releasedMargin = holding.shortQuantity === quantity
                    ? holding.shortMarginFrozen
                    : holding.shortMarginFrozen * (quantity / holding.shortQuantity);
                const shortProfit = (holding.shortAvgCost - stock.price) * quantity;
                // 归还借券所得现金，并释放初始保证金，再结算盈亏
                if (currentPlayer.cash + currentPlayer.deposit + releasedMargin + shortProfit < coverCost) {
                    socket.emit('error', { message: '亏损超过可用资金，无法平仓' });
                    return;
                }
                holding.shortQuantity -= quantity;
                holding.shortMarginFrozen -= releasedMargin;
                currentPlayer.cash -= coverCost;
                currentPlayer.deposit += releasedMargin;
                currentPlayer.cash += shortProfit;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 平空 ${quantity} 股 ${stock.name}，${shortProfit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(shortProfit))}`);
                if (holding.shortQuantity === 0) {
                    holding.shortAvgCost = 0;
                }
                break;
        }
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 期货交易（双向 + T+0 + 杠杆 + 涨跌停 + 实物交割） ============
    socket.on('tradeFutures', ({ symbol, action, quantity, leverage }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const futures = currentRoom.futures.find(f => f.symbol === symbol);
        if (!futures) {
            socket.emit('error', { message: '期货不存在' });
            return;
        }
        // 杠杆倍数：1~10，1 = 无杠杆（全款），10 = 10 倍杠杆
        const lev = Math.max(1, Math.min(10, leverage || 1));
        const notional = Math.round(futures.price * futures.unit * quantity);
        const fee = Math.floor(notional * FUTURES_FEE_RATE);
        // 每个玩家每个品种维护一份多空持仓及保证金记录。
        if (!currentPlayer.futuresHoldings)
            currentPlayer.futuresHoldings = [];
        const holdings = currentPlayer.futuresHoldings;
        let holding = holdings.find(h => h.symbol === symbol);
        if (!holding) {
            holding = {
                symbol,
                longQuantity: 0, longAvgCost: 0,
                shortQuantity: 0, shortAvgCost: 0,
                shortInitialMargin: 0, shortMaintenanceMargin: 0,
                longLeverage: 1, shortLeverage: 1,
                longFrozenCost: 0,
                longOpenedOnDay: currentRoom.currentTurn, shortOpenedOnDay: currentRoom.currentTurn
            };
            holdings.push(holding);
        }
        if (holding.longLeverage === undefined)
            holding.longLeverage = 1;
        if (holding.shortLeverage === undefined)
            holding.shortLeverage = 1;
        if (holding.longFrozenCost === undefined)
            holding.longFrozenCost = 0;
        if (holding.longOpenedOnDay === undefined)
            holding.longOpenedOnDay = currentRoom.currentTurn;
        if (holding.shortOpenedOnDay === undefined)
            holding.shortOpenedOnDay = currentRoom.currentTurn;
        switch (action) {
            case 'buy': {
                // 开仓做多（看涨）：冻结 cost/lev × lev = cost 的资金，lev > 1 时少冻结
                if (futures.limitUp) {
                    socket.emit('error', { message: '该期货涨停，无法买入开仓' });
                    return;
                }
                // 实际冻结 = 名义价值 / 杠杆
                const marginRequired = Math.ceil(notional / lev);
                // 期货保证金只从存款扣（现金留给地皮交易）
                if (currentPlayer.deposit < marginRequired + fee) {
                    socket.emit('error', { message: `存款不足：需冻结 $${marginRequired.toLocaleString()} + 手续费 $${fee}（请先到银行存款）` });
                    return;
                }
                currentPlayer.deposit -= (marginRequired + fee);
                const totalQty = holding.longQuantity + quantity;
                holding.longAvgCost = (holding.longAvgCost * holding.longQuantity + futures.price * futures.unit * quantity) / totalQty;
                holding.longQuantity = totalQty;
                holding.longFrozenCost += marginRequired;
                // 杠杆取最大值（保证账户安全）
                if (lev > holding.longLeverage)
                    holding.longLeverage = lev;
                holding.longOpenedOnDay = currentRoom.currentTurn;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 做多开仓 ${futures.name} x${quantity}（${lev}x杠杆，冻结 $${marginRequired.toLocaleString()}，手续费 $${fee}，存款扣款）`);
                break;
            }
            case 'sell': {
                // 开仓做空（看跌）：只冻结初始保证金 = notional × FUTURES_INITIAL_MARGIN_RATE / lev
                if (futures.limitDown) {
                    socket.emit('error', { message: '该期货跌停，无法卖出开仓' });
                    return;
                }
                const initialMargin = Math.ceil(notional * FUTURES_INITIAL_MARGIN_RATE / lev);
                const requiredFunds = initialMargin + fee;
                // 期货保证金只从存款扣
                if (currentPlayer.deposit < requiredFunds) {
                    socket.emit('error', { message: `存款不足：初始保证金 $${initialMargin} + 手续费 $${fee}（请先到银行存款）` });
                    return;
                }
                currentPlayer.deposit -= requiredFunds;
                const totalQty = holding.shortQuantity + quantity;
                holding.shortAvgCost = (holding.shortAvgCost * holding.shortQuantity + futures.price * futures.unit * quantity) / totalQty;
                holding.shortQuantity = totalQty;
                holding.shortInitialMargin += initialMargin;
                holding.shortMaintenanceMargin = futures.price * futures.unit * holding.shortQuantity * FUTURES_MAINTENANCE_MARGIN_RATE;
                if (lev > holding.shortLeverage)
                    holding.shortLeverage = lev;
                holding.shortOpenedOnDay = currentRoom.currentTurn;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 做空开仓 ${futures.name} x${quantity}（${lev}x杠杆，初始保证金 $${initialMargin}，维持保证金 $${Math.round(holding.shortMaintenanceMargin)}，手续费 $${fee}，存款扣款）`);
                break;
            }
            case 'close': {
                // 平仓：先平多，再平空（按 quantity 拆分）
                if (holding.longQuantity === 0 && holding.shortQuantity === 0) {
                    socket.emit('error', { message: '无持仓' });
                    return;
                }
                if (futures.limitUp && holding.longQuantity > 0) {
                    socket.emit('error', { message: '该期货涨停，无法平多仓' });
                    return;
                }
                if (futures.limitDown && holding.shortQuantity > 0) {
                    socket.emit('error', { message: '该期货跌停，无法平空仓' });
                    return;
                }
                let remain = quantity;
                let settlement = 0;
                if (holding.longQuantity > 0 && remain > 0) {
                    const qty = Math.min(remain, holding.longQuantity);
                    const longNotional = futures.price * futures.unit * qty;
                    // 释放按比例冻结的资金
                    const frozenPerUnit = holding.longFrozenCost / holding.longQuantity;
                    const releaseFrozen = qty * frozenPerUnit;
                    const profit = (futures.price - holding.longAvgCost) * futures.unit * qty;
                    settlement += releaseFrozen + profit - Math.floor(longNotional * FUTURES_FEE_RATE);
                    holding.longQuantity -= qty;
                    holding.longFrozenCost -= releaseFrozen;
                    if (holding.longQuantity === 0) {
                        holding.longAvgCost = 0;
                        holding.longFrozenCost = 0;
                        holding.longLeverage = 1;
                    }
                    remain -= qty;
                    sendMessage(currentRoom, 'info', `${currentPlayer.name} 平多 ${qty} 手 ${futures.name}：${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}（冻结资金 $${Math.round(releaseFrozen).toLocaleString()} 返还）`);
                }
                if (holding.shortQuantity > 0 && remain > 0) {
                    const qty = Math.min(remain, holding.shortQuantity);
                    const shortNotional = futures.price * futures.unit * qty;
                    const profit = (holding.shortAvgCost - futures.price) * futures.unit * qty;
                    const initMarginPerUnit = holding.shortQuantity > 0
                        ? holding.shortInitialMargin / holding.shortQuantity
                        : 0;
                    settlement += qty * initMarginPerUnit + profit - Math.floor(shortNotional * FUTURES_FEE_RATE);
                    holding.shortQuantity -= qty;
                    holding.shortInitialMargin = Math.max(0, holding.shortInitialMargin - qty * initMarginPerUnit);
                    holding.shortMaintenanceMargin = futures.price * futures.unit * holding.shortQuantity * FUTURES_MAINTENANCE_MARGIN_RATE;
                    if (holding.shortQuantity === 0) {
                        holding.shortAvgCost = 0;
                        holding.shortInitialMargin = 0;
                        holding.shortMaintenanceMargin = 0;
                        holding.shortLeverage = 1;
                    }
                    remain -= qty;
                    sendMessage(currentRoom, 'info', `${currentPlayer.name} 平空 ${qty} 手 ${futures.name}：${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}（初始保证金 $${Math.round(qty * initMarginPerUnit).toLocaleString()} 返还）`);
                }
                if (remain > 0) {
                    socket.emit('error', { message: `持仓不足，还差 ${remain} 手未平` });
                    return;
                }
                if (settlement >= 0) {
                    addFunds(currentPlayer, settlement, 'deposit');
                }
                else if (!deductFunds(currentPlayer, -settlement, 'auto')) {
                    currentPlayer.isBankrupt = true;
                    sendMessage(currentRoom, 'error', `${currentPlayer.name} 期货平仓亏损超过可用资金，已破产`);
                }
                break;
            }
            case 'delivery': {
                // 实物交割：玩家主动申请
                const matMap = {
                    cement: 'cement', steel: 'steel', rubber: 'rubber'
                };
                const isPrecious = futures.category === 'precious';
                if (!futures.isMaterial && !isPrecious) {
                    socket.emit('error', { message: '该期货不支持实物交割（仅建材/贵金属可交割）' });
                    return;
                }
                if (holding.longQuantity === 0 && holding.shortQuantity === 0) {
                    socket.emit('error', { message: '无持仓可交割' });
                    return;
                }
                // 多头：按当前价付款 → 获得实物
                if (holding.longQuantity > 0) {
                    if (futures.isMaterial) {
                        const mat = matMap[futures.type];
                        // 释放冻结资金（按持仓平均）
                        const totalFrozen = holding.longFrozenCost;
                        const settlement = totalFrozen;
                        const cost = futures.price * futures.unit * holding.longQuantity;
                        const profit = (futures.price - holding.longAvgCost) * futures.unit * holding.longQuantity;
                        currentPlayer.materials[mat] += holding.longQuantity;
                        currentPlayer.deposit += settlement + profit;
                        sendMessage(currentRoom, 'success', `${currentPlayer.name} 多头实物交割 ${holding.longQuantity} 手 ${futures.name}：获得 ${mat === 'cement' ? '水泥' : mat === 'steel' ? '钢材' : '橡胶'} ×${holding.longQuantity}（货款 $${cost.toLocaleString()}，获利 $${Math.round(profit).toLocaleString()}）`);
                    }
                    else if (isPrecious) {
                        // 贵金属（黄金/白银/钻石）交割
                        const totalFrozen = holding.longFrozenCost;
                        const profit = (futures.price - holding.longAvgCost) * futures.unit * holding.longQuantity;
                        const settle = totalFrozen + profit;
                        if (futures.type === 'gold')
                            currentPlayer.materials.preciousMetals += holding.longQuantity;
                        else if (futures.type === 'silver')
                            currentPlayer.materials.preciousMetals += holding.longQuantity * 10; // 银换算为贵金属单位
                        else if (futures.type === 'diamond')
                            currentPlayer.diamonds += holding.longQuantity;
                        currentPlayer.deposit += settle;
                        const itemName = futures.type === 'gold' ? '黄金' : futures.type === 'silver' ? '白银' : '钻石';
                        sendMessage(currentRoom, 'success', `${currentPlayer.name} 多头实物交割 ${holding.longQuantity} 手 ${futures.name}：获得 ${itemName} ×${holding.longQuantity}（获利 $${Math.round(profit).toLocaleString()}）`);
                    }
                    holding.longQuantity = 0;
                    holding.longAvgCost = 0;
                    holding.longFrozenCost = 0;
                    holding.longLeverage = 1;
                }
                // 空头：交付实物 → 收到货款
                if (holding.shortQuantity > 0) {
                    if (futures.isMaterial) {
                        const mat = matMap[futures.type];
                        const required = holding.shortQuantity;
                        if (currentPlayer.materials[mat] < required) {
                            const shortage = required - currentPlayer.materials[mat];
                            // 实物违约处罚：扣除现金 + 信用降级（破产）
                            const penalty = (holding.shortInitialMargin + holding.shortQuantity * futures.price * futures.unit * 0.3) || 1000;
                            deductFunds(currentPlayer, penalty, 'auto');
                            // 强制平空
                            const closeProfit = (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity;
                            const shortNotional = futures.price * futures.unit * holding.shortQuantity;
                            const release = holding.shortInitialMargin + closeProfit - Math.floor(shortNotional * FUTURES_FEE_RATE);
                            if (release >= 0)
                                addFunds(currentPlayer, release, 'deposit');
                            holding.shortQuantity = 0;
                            holding.shortAvgCost = 0;
                            holding.shortInitialMargin = 0;
                            holding.shortMaintenanceMargin = 0;
                            holding.shortLeverage = 1;
                            sendMessage(currentRoom, 'error', `${currentPlayer.name} 空头交割违约！缺少 ${mat === 'cement' ? '水泥' : mat === 'steel' ? '钢材' : '橡胶'} ×${shortage}，处罚 $${Math.round(penalty).toLocaleString()} 并强制平仓`);
                            break;
                        }
                        currentPlayer.materials[mat] -= required;
                        const totalPaid = holding.shortInitialMargin;
                        const profit = (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity;
                        const received = futures.price * futures.unit * holding.shortQuantity;
                        currentPlayer.deposit += totalPaid + received + profit;
                        sendMessage(currentRoom, 'success', `${currentPlayer.name} 空头实物交割 ${holding.shortQuantity} 手 ${futures.name}：交付 ${mat === 'cement' ? '水泥' : mat === 'steel' ? '钢材' : '橡胶'} ×${required}，收到货款 $${Math.round(received).toLocaleString()}（${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit)).toLocaleString()}）`);
                    }
                    else if (isPrecious) {
                        // 贵金属空头交割
                        let haveEnough = true;
                        const needQty = holding.shortQuantity;
                        if (futures.type === 'gold' && currentPlayer.materials.preciousMetals < needQty)
                            haveEnough = false;
                        if (futures.type === 'silver' && currentPlayer.materials.preciousMetals < needQty * 10)
                            haveEnough = false;
                        if (futures.type === 'diamond' && currentPlayer.diamonds < needQty)
                            haveEnough = false;
                        if (!haveEnough) {
                            const penalty = (holding.shortInitialMargin + holding.shortQuantity * futures.price * futures.unit * 0.3) || 1000;
                            deductFunds(currentPlayer, penalty, 'auto');
                            const closeProfit = (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity;
                            const shortNotional = futures.price * futures.unit * holding.shortQuantity;
                            const release = holding.shortInitialMargin + closeProfit - Math.floor(shortNotional * FUTURES_FEE_RATE);
                            if (release >= 0)
                                addFunds(currentPlayer, release, 'deposit');
                            holding.shortQuantity = 0;
                            holding.shortAvgCost = 0;
                            holding.shortInitialMargin = 0;
                            holding.shortMaintenanceMargin = 0;
                            holding.shortLeverage = 1;
                            sendMessage(currentRoom, 'error', `${currentPlayer.name} 空头贵金属交割违约，处罚 $${Math.round(penalty).toLocaleString()} 并强制平仓`);
                            break;
                        }
                        if (futures.type === 'gold')
                            currentPlayer.materials.preciousMetals -= needQty;
                        else if (futures.type === 'silver')
                            currentPlayer.materials.preciousMetals -= needQty * 10;
                        else if (futures.type === 'diamond')
                            currentPlayer.diamonds -= needQty;
                        const totalPaid = holding.shortInitialMargin;
                        const received = futures.price * futures.unit * holding.shortQuantity;
                        const profit = (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity;
                        currentPlayer.deposit += totalPaid + received + profit;
                        const itemName = futures.type === 'gold' ? '黄金' : futures.type === 'silver' ? '白银' : '钻石';
                        sendMessage(currentRoom, 'success', `${currentPlayer.name} 空头实物交割 ${holding.shortQuantity} 手 ${futures.name}：交付 ${itemName} ×${needQty}，收到货款 $${Math.round(received).toLocaleString()}`);
                    }
                    holding.shortQuantity = 0;
                    holding.shortAvgCost = 0;
                    holding.shortInitialMargin = 0;
                    holding.shortMaintenanceMargin = 0;
                    holding.shortLeverage = 1;
                }
                break;
            }
        }
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
    });
    // ============ 购买同花顺软件（股票交易所售卖的永久道具） ============
    socket.on('buyTonghuashun', () => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (!currentPlayer.atStockExchange) {
            socket.emit('error', { message: '需要站在股票交易所才能购买' });
            return;
        }
        if (currentPlayer.hasTonghuashun) {
            socket.emit('error', { message: '你已经拥有同花顺软件了' });
            return;
        }
        const price = 20_000_000;
        if (currentPlayer.cash + currentPlayer.deposit < price) {
            socket.emit('error', { message: `资金不足（需 $${price.toLocaleString()}）` });
            return;
        }
        // 同花顺软件只能从存款中扣款
        if (currentPlayer.deposit < price) {
            socket.emit('error', { message: `存款不足（需 $${price.toLocaleString()}，请先到银行存款）` });
            return;
        }
        currentPlayer.deposit -= price;
        currentPlayer.hasTonghuashun = true;
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 购买 [同花顺软件]（$${price.toLocaleString()}），可在任意位置查看股票/期货的利好利空消息！`);
        broadcastRoomState(currentRoom);
    });
    // ============ 期货交易所：兑换吸引力 ============
    // 站在期货交易所，用现金换吸引力（1吸引力 = 2000 现金）
    socket.on('exchangeAttraction', ({ amount }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        if (!currentPlayer.atFuturesExchange) {
            socket.emit('error', { message: '需要站在期货交易所才能兑换' });
            return;
        }
        const qty = Math.floor(amount);
        if (!qty || qty <= 0) {
            socket.emit('error', { message: '请输入正整数' });
            return;
        }
        const cost = qty * 2000;
        if (currentPlayer.cash < cost) {
            socket.emit('error', { message: `现金不足（需 $${cost.toLocaleString()}，当前 $${currentPlayer.cash.toLocaleString()}）` });
            return;
        }
        currentPlayer.cash -= cost;
        currentPlayer.attraction = (currentPlayer.attraction || 0) + qty;
        sendMessage(currentRoom, 'info', `🛢️ ${currentPlayer.name} 在期货交易所用 $${cost.toLocaleString()} 兑换了 ${qty} 吸引力`);
        broadcastRoomState(currentRoom);
    });
    // ============ 房地产交易中心 - 拍卖出价 ============
    socket.on('buyAuction', ({ cellId, bid }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cell = currentRoom.cells[cellId];
        if (!cell || !cell.auctionActive) {
            socket.emit('error', { message: '该地皮未在拍卖中' });
            return;
        }
        if (cell.auctionHighestBidder === currentPlayer.id) {
            socket.emit('error', { message: '你已是最高出价者' });
            return;
        }
        const minBid = Math.floor((cell.auctionHighestBid || cell.auctionReservedPrice || 0) * 1.1);
        if (bid < minBid) {
            socket.emit('error', { message: `出价太低，至少 $${minBid.toLocaleString()}（当前最高 $${cell.auctionHighestBid}，需加10%）` });
            return;
        }
        if (currentPlayer.cash < bid) {
            socket.emit('error', { message: `现金不足（需 $${bid.toLocaleString()}）` });
            return;
        }
        cell.auctionHighestBid = bid;
        cell.auctionHighestBidder = currentPlayer.id;
        sendMessage(currentRoom, 'info', `🔨 ${currentPlayer.name} 对 [${cell.name}] 出价 $${bid.toLocaleString()}`);
        broadcastRoomState(currentRoom);
    });
    // ============ 玩家之间交易地皮 ============
    socket.on('tradeProperty', ({ cellId, targetPlayerId, price }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        const cell = currentRoom.cells[cellId];
        if (!cell || cell.owner !== currentPlayer.id) {
            socket.emit('error', { message: '你必须拥有这块地皮才能交易' });
            return;
        }
        if (cell.fromAuction) {
            socket.emit('error', { message: '拍卖地皮不可交易' });
            return;
        }
        const target = currentRoom.players.find(p => p.id === targetPlayerId);
        if (!target || target.isBankrupt) {
            socket.emit('error', { message: '目标玩家无效' });
            return;
        }
        if (price <= 0 || target.cash < price) {
            socket.emit('error', { message: `价格无效或买家现金不足（需 $${(price || 0).toLocaleString()}）` });
            return;
        }
        target.cash -= price;
        currentPlayer.cash += price;
        cell.owner = target.id;
        currentPlayer.properties = currentPlayer.properties.filter(id => id !== cellId);
        if (!target.properties.includes(cellId))
            target.properties.push(cellId);
        sendMessage(currentRoom, 'success', `🤝 ${currentPlayer.name} 将 [${cell.name}] 以 $${price.toLocaleString()} 卖给 ${target.name}`);
        broadcastRoomState(currentRoom);
    });
    // ============ 占用卡：抢占地皮（200钻石，顶以下任意地皮） ============
    socket.on('useSeizeCard', ({ cardName, cellId }) => {
        if (!currentRoom)
            return;
        const currentPlayer = currentRoom.players[currentRoom.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== socket.id) {
            socket.emit('error', { message: '不是你的回合' });
            return;
        }
        // 200 钻石
        if ((currentPlayer.diamonds || 0) < 200) {
            socket.emit('error', { message: `钻石不足（需 200 💎，当前 ${currentPlayer.diamonds || 0}）` });
            return;
        }
        let targetCell;
        if (cellId !== undefined && cellId !== null) {
            targetCell = currentRoom.cells[cellId];
            if (!targetCell || targetCell.type !== 'empty') {
                socket.emit('error', { message: '该格不可占用' });
                return;
            }
            if (targetCell.level >= 4) {
                socket.emit('error', { message: '顶级的地皮不可占用' });
                return;
            }
            if (targetCell.owner === currentPlayer.id) {
                socket.emit('error', { message: '这已经是你的地了' });
                return;
            }
        }
        else {
            targetCell = currentRoom.cells.find(c => c.type === 'empty' && c.owner && c.owner !== currentPlayer.id && c.level < 4);
            if (!targetCell) {
                socket.emit('error', { message: '没有可占用的地皮（必须非顶级）' });
                return;
            }
        }
        currentPlayer.diamonds -= 200;
        // 原主人失去
        if (targetCell.owner) {
            const oldOwner = currentRoom.players.find(p => p.id === targetCell.owner);
            if (oldOwner) {
                oldOwner.properties = oldOwner.properties.filter(id => id !== targetCell.id);
                sendMessage(currentRoom, 'warning', `😱 ${oldOwner.name} 的 [${targetCell.name}] 被 ${currentPlayer.name} 抢占！`);
            }
        }
        targetCell.owner = currentPlayer.id;
        targetCell.level = 0;
        targetCell.price = targetCell.basePrice;
        targetCell.visitCount = 0;
        if (!currentPlayer.properties.includes(targetCell.id))
            currentPlayer.properties.push(targetCell.id);
        sendMessage(currentRoom, 'success', `💎 ${currentPlayer.name} 用 200💎 占用 [${targetCell.name}] 成功！`);
        broadcastRoomState(currentRoom);
    });
    // ============ 存款买钻石 ============
    // 已移除（只能通过期货交易或地块获得钻石）
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (currentRoom && currentRoom.phase === 'lobby' && !currentRoom.players[0]?.isAI) {
            currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id);
            if (currentRoom.players.length === 0 || (currentRoom.players.length === 1 && currentRoom.players[0].isAI)) {
                rooms.delete(currentRoom.code);
            }
            else {
                sendMessage(currentRoom, 'info', '一名玩家离开了');
                broadcastRoomState(currentRoom);
            }
        }
        else if (currentRoom && currentRoom.mode === 'singleplayer') {
            sendMessage(currentRoom, 'warning', '玩家已断线，游戏结束');
            currentRoom.phase = 'ended';
            broadcastRoomState(currentRoom);
        }
    });
});
const PORT = process.env.PORT || 3002;
httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
