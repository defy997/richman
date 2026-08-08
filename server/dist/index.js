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
const SINGLEPLAYER_TARGET = 1_000_000;
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
const TOTAL_CELLS = 60;
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
    { name: '黄金期货', type: 'gold' },
    { name: '白银期货', type: 'silver' },
    { name: '钻石期货', type: 'diamond' }
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
// ============ Generate 60-cell square board ============
// 方形布局：顶排(0-14) → 右列(15-29) → 底排(30-44) → 左列(45-59)
// 起点在左上角(0)，顺时针
function generateCells() {
    // 特殊格位置（60格方形）
    // 起点: 0
    // 银行: 5 (顶排中部)
    // 股票交易所: 25 (右列中部)
    // 期货交易所: 45 (左列中部)
    // 钻石: 10, 20, 35, 50
    // 机会: 3, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57
    // 命运: 15, 30, 40, 55
    const special = {};
    const cellTypes = [];
    for (let i = 0; i < TOTAL_CELLS; i++) {
        let type = 'empty';
        if (i === 0)
            type = 'start';
        else if (i === 5)
            type = 'bank';
        else if (i === 25)
            type = 'stock';
        else if (i === 45)
            type = 'futures';
        else if ([10, 20, 35, 50].includes(i))
            type = 'diamond';
        else if ([3, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57].includes(i))
            type = 'chance';
        else if ([15, 30, 40, 55].includes(i))
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
                    '嘉定', '金山', '松江', '青浦', '奉贤', '崇明', '西湖', '滨江', '上城', '下城'
                ];
                name = regionNames[i] || `地块${i}`;
                // 价位：顶排和右列较贵
                if (i >= 30 && i <= 44)
                    basePrice = Math.floor(Math.random() * 800) + 600;
                else if (i >= 45 && i <= 59)
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
        // 散户：跟趋势 + 大幅噪声
        const retailSentiment = clamp(momentum * 0.4 + rand(-0.23, 0.23), -1, 1);
        // 机构：均衡 + 注重基本面
        const bigSentiment = clamp(0.35 * momentum + 0.35 * fundamentalSignal + rand(-0.30, 0.30), -1, 1);
        // 游资：基本面为主
        const hotSentiment = clamp(0.20 * momentum + 0.60 * fundamentalSignal + rand(-0.12, 0.12), -1, 1);
        // 量化：均线交叉
        const quantSentiment = (ma5 > ma10 ? 1 : -1) * clamp(1 + rand(-0.22, 0.22), 0.5, 1.2);
        // 操盘手：四阶段策略
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
    const basePrices = { gold: 1800, silver: 25, diamond: 5000 }; // 黄金/白银/钻石基础价
    FUTURES_NAMES.forEach((f, i) => {
        const base = basePrices[f.type];
        const initialPrice = Math.round(base * (0.85 + Math.random() * 0.3) * 100) / 100;
        const history = [{ open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice, volume: 0 }];
        const fc = {
            symbol: `FT${String(i + 1).padStart(2, '0')}`,
            name: f.name,
            type: f.type,
            price: initialPrice,
            change: 0,
            unit: 1,
            base,
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
            noManipulatorDays: 0
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
// 期货模拟（简化版：无操盘手，事件影响小）
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
    if (f.eventDays > 0) {
        f.eventDays--;
        if (f.eventDays === 0) {
            f.eventEffect = 1.0;
            f.eventDesc = '无重大事件';
        }
    }
    else if (Math.random() < 0.10) {
        const r = randInt(0, 4);
        switch (r) {
            case 0:
                f.eventEffect = 1.18;
                f.eventDesc = '产地供应紧张';
                f.eventDays = randInt(7, 12);
                break;
            case 1:
                f.eventEffect = 0.85;
                f.eventDesc = '需求疲软';
                f.eventDays = randInt(5, 10);
                break;
            case 2:
                f.eventEffect = 1.12;
                f.eventDesc = '央行储备增加';
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
    const lastClose = f.history[f.history.length - 1].close;
    const prevClose = f.history.length > 1 ? f.history[f.history.length - 2].close : lastClose;
    const ma5 = movingAverageFutures(f, 5);
    const ma10 = movingAverageFutures(f, 10);
    const fundamentalSignal = (f.base * f.eventEffect - lastClose) / Math.max(lastClose, 1);
    const momentum = prevClose > 0 ? (lastClose - prevClose) / prevClose : 0;
    // 期货价格主要由基本面 + 趋势驱动
    const meanReversion = (f.base * f.eventEffect - lastClose) / lastClose * 0.06;
    const trendBias = (ma5 - ma10) / Math.max(ma10, 1) * 0.5;
    const eventBias = (f.eventEffect - 1.0) * 0.08;
    const noise = rand(-0.025, 0.025);
    let dailyReturn = clamp(meanReversion + trendBias + eventBias + momentum * 0.3 + noise, -0.15, 0.15);
    if (f.isConsolidating && !f.isNoManipulator) {
        dailyReturn = clamp(dailyReturn, -0.005, 0.005);
    }
    dailyReturn = clamp(dailyReturn, -0.15, 0.15);
    const newPrice = Math.max(0.01, Math.round(lastClose * Math.exp(dailyReturn) * 100) / 100);
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
        return sum + (cell?.basePrice || 0) * (1 + (cell?.level || 0) * 0.5);
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
    const state = {
        roomCode: room.code,
        mode: room.mode,
        targetAssets: room.targetAssets,
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
        stocks: room.stocks,
        futures: room.futures,
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
        sendMessage(room, 'info', `${room.stocks[idx].name}(${room.stocks[idx].symbol}): ${news}`);
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
        simulateFuturesDay(f);
        const closes = f.history.map(h => h.close);
        f.ma5 = calcMA(closes, 5);
        f.ma10 = calcMA(closes, 10);
        f.ma20 = calcMA(closes, 20);
        f.kline = closes.slice(-30);
        f.news = f.eventDesc !== '无重大事件' ? f.eventDesc : undefined;
    });
    recalcAllAssets(room);
}
// ============ Process Cell Event ============
function processCellEvent(room, player) {
    const cell = room.cells[player.position];
    // 清除经过银行标记（只有站在银行才有效）
    player.passedBank = false;
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
            sendMessage(room, 'info', `${player.name} 来到股票交易所，可在下方面板进行股票交易`);
            break;
        case 'futures':
            sendMessage(room, 'info', `${player.name} 来到期货交易所，可用存款交易期货赚取钻石`);
            break;
        case 'chance': {
            // 走到机会地皮：随机获得一张可购买卡片
            const giftCards = ['停留卡', '骰子卡', '均贫卡', '红心卡', '黑心卡', '地皮升级卡'];
            const cardName = giftCards[Math.floor(Math.random() * giftCards.length)];
            player.cards.push(cardName);
            sendMessage(room, 'success', `${player.name} 抽到机会卡，获得 [${cardName}]`);
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
        case 'empty':
            if (cell.owner && cell.owner !== player.id) {
                const owner = room.players.find(p => p.id === cell.owner);
                if (owner && !owner.isBankrupt) {
                    const fee = cell.basePrice * Math.pow(2, cell.level);
                    if (player.cash >= fee) {
                        player.cash -= fee;
                        owner.cash += fee;
                        sendMessage(room, 'info', `${player.name} 支付过路费 $${fee} 给 ${owner.name}`);
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
function checkSingleplayerWin(room) {
    if (room.mode !== 'singleplayer')
        return false;
    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.isAI)
        return false;
    const assets = calculateAssets(currentPlayer, room);
    if (assets >= room.targetAssets) {
        room.phase = 'ended';
        room.winnerId = currentPlayer.id;
        sendMessage(room, 'success', `🎉 恭喜 ${currentPlayer.name}！总资产达到 $${assets.toLocaleString()}，达成百万富翁目标！`);
        sendMessage(room, 'info', `游戏共进行 ${room.currentTurn} 回合`);
        broadcastRoomState(room);
        return true;
    }
    return false;
}
// ============ Next Player ============
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
        processLoans(room);
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
                        if (Math.random() < 0.4) {
                            player.cash -= Math.floor(propCell.basePrice * 0.5);
                            propCell.level++;
                            propCell.price = Math.floor(propCell.basePrice * (1 + propCell.level * 0.5));
                            sendMessage(room, 'success', `🤖 ${player.name} 将 ${propCell.name} 升级到 Lv.${propCell.level}`);
                            broadcastRoomState(room);
                            break;
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
    socket.on('createRoom', ({ playerName }) => {
        const code = generateRoomCode();
        const room = {
            code,
            mode: 'multiplayer',
            players: [{
                    id: socket.id,
                    socketId: socket.id,
                    name: playerName,
                    color: PLAYER_COLORS[0],
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
                    isAI: false
                }],
            cells: generateCells(),
            stocks: generateStocks(),
            futures: generateFutures(),
            currentPlayerIndex: 0,
            currentTurn: 1,
            phase: 'lobby',
            diceValue: null,
            forcedDice: null,
            stayCurrentTurn: false,
            targetAssets: 0,
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
        const humanPlayer = {
            id: socket.id,
            socketId: socket.id,
            name: playerName || '玩家',
            color: PLAYER_COLORS[0],
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
            isAI: false
        };
        const players = [humanPlayer];
        const aiPool = difficulty === 'easy' ? AI_NAMES_EASY : difficulty === 'hard' ? AI_NAMES_HARD : AI_NAMES_NORMAL;
        for (let i = 0; i < aiCount && i < 5; i++) {
            players.push({
                id: `ai_${code}_${i}`,
                socketId: '',
                name: aiPool[i % aiPool.length],
                color: PLAYER_COLORS[i + 1],
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
                isAI: true,
                aiDifficulty: difficulty
            });
        }
        const room = {
            code,
            mode: 'singleplayer',
            players,
            cells: generateCells(),
            stocks: generateStocks(),
            futures: generateFutures(),
            currentPlayerIndex: 0,
            currentTurn: 1,
            phase: 'playing',
            diceValue: null,
            forcedDice: null,
            stayCurrentTurn: false,
            targetAssets: SINGLEPLAYER_TARGET,
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
        if (room.players.length >= 6) {
            socket.emit('error', { message: '房间已满' });
            return;
        }
        const player = {
            id: socket.id,
            socketId: socket.id,
            name: playerName,
            color: PLAYER_COLORS[room.players.length],
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
            isAI: false
        };
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
            socket.emit('error', { message: '已达最高等级' });
            return;
        }
        // 第二次到同一块地才能升级（visitCount >= 2）
        const visits = cell.visitCount || 0;
        if (visits < 2) {
            socket.emit('error', { message: `需要再次到达此地才能升级（已到 ${visits} 次，需要 2 次）` });
            return;
        }
        // 升级费用固定 $500
        const upgradeCost = 500;
        if (currentPlayer.cash + currentPlayer.deposit < upgradeCost) {
            socket.emit('error', { message: '现金+存款不足 $500' });
            return;
        }
        // 先扣现金，不足从存款扣
        deductFunds(currentPlayer, upgradeCost, 'auto');
        cell.level++;
        cell.price = Math.floor(cell.basePrice * (1 + cell.level * 0.5));
        // 升级后重置访问计数
        cell.visitCount = 0;
        sendMessage(currentRoom, 'success', `${currentPlayer.name} 将 ${cell.name} 升级到 Lv.${cell.level}（花费 $${upgradeCost}）`);
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
            '红心卡': 60, '黑心卡': 80, '地皮升级卡': 60
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
            case '红心卡': {
                const upStock = currentRoom.stocks.find(s => s.symbol === target);
                if (!upStock) {
                    socket.emit('error', { message: '股票不存在' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                upStock.trend = 'up';
                upStock.trendDays = 3;
                sendMessage(currentRoom, 'success', `${currentPlayer.name} 使用红心卡，${upStock.name} 连续上涨3天`);
                break;
            }
            case '黑心卡': {
                const downStock = currentRoom.stocks.find(s => s.symbol === target);
                if (!downStock) {
                    socket.emit('error', { message: '股票不存在' });
                    currentPlayer.cards.push(cardName);
                    return;
                }
                downStock.trend = 'down';
                downStock.trendDays = 4;
                sendMessage(currentRoom, 'warning', `${currentPlayer.name} 使用黑心卡，${downStock.name} 连续下跌4天`);
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
                // 买入从存款扣（无存款时现金补）
                if (!deductFunds(currentPlayer, buyCost, 'auto')) {
                    socket.emit('error', { message: '现金+存款不足' });
                    return;
                }
                const newAvgCost = (holding.avgCost * holding.quantity + stock.price * quantity) / (holding.quantity + quantity);
                holding.avgCost = newAvgCost;
                holding.quantity += quantity;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 以 $${stock.price} 买入 ${quantity} 股 ${stock.name}（${leverage}x杠杆，$${buyCost.toLocaleString()}）`);
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
    // ============ 期货交易 ============
    socket.on('tradeFutures', ({ symbol, action, quantity }) => {
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
        const notional = Math.round(futures.price * futures.unit * quantity);
        const fee = Math.floor(notional * FUTURES_FEE_RATE);
        // 每个玩家每个品种维护一份多空持仓及保证金记录。
        if (!currentPlayer.futuresHoldings)
            currentPlayer.futuresHoldings = [];
        const holdings = currentPlayer.futuresHoldings;
        let holding = holdings.find(h => h.symbol === symbol);
        if (!holding) {
            holding = {
                symbol, longQuantity: 0, longAvgCost: 0,
                shortQuantity: 0, shortAvgCost: 0,
                shortInitialMargin: 0, shortMaintenanceMargin: 0
            };
            holdings.push(holding);
        }
        switch (action) {
            case 'buy': {
                // 做多仍按名义价值占用资金。
                if (!deductFunds(currentPlayer, notional + fee, 'auto')) {
                    socket.emit('error', { message: '资金不足（现金+存款）' });
                    return;
                }
                holding.longAvgCost = (holding.longAvgCost * holding.longQuantity + futures.price * futures.unit * quantity) / (holding.longQuantity + quantity);
                holding.longQuantity += quantity;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 做多 ${futures.name} x${quantity}（名义价值 $${notional}，手续费 $${fee}）`);
                break;
            }
            case 'sell': {
                // 做空只冻结初始保证金，不再错误地扣除全部名义价值。
                const initialMargin = Math.ceil(notional * FUTURES_INITIAL_MARGIN_RATE);
                const requiredFunds = initialMargin + fee;
                if (!deductFunds(currentPlayer, requiredFunds, 'auto')) {
                    socket.emit('error', { message: `资金不足：初始保证金 $${initialMargin} + 手续费 $${fee}` });
                    return;
                }
                holding.shortAvgCost = (holding.shortAvgCost * holding.shortQuantity + futures.price * futures.unit * quantity) / (holding.shortQuantity + quantity);
                holding.shortQuantity += quantity;
                holding.shortInitialMargin += initialMargin;
                holding.shortMaintenanceMargin = futures.price * futures.unit * holding.shortQuantity * FUTURES_MAINTENANCE_MARGIN_RATE;
                sendMessage(currentRoom, 'info', `${currentPlayer.name} 做空 ${futures.name} x${quantity}（初始保证金 $${initialMargin}，维持保证金 $${Math.round(holding.shortMaintenanceMargin)}，手续费 $${fee}）`);
                break;
            }
            case 'close': {
                if (holding.longQuantity === 0 && holding.shortQuantity === 0) {
                    socket.emit('error', { message: '无持仓' });
                    return;
                }
                let settlement = 0;
                if (holding.longQuantity > 0) {
                    const longNotional = futures.price * futures.unit * holding.longQuantity;
                    const profit = (futures.price - holding.longAvgCost) * futures.unit * holding.longQuantity;
                    settlement += holding.longAvgCost * futures.unit * holding.longQuantity + profit - Math.floor(longNotional * FUTURES_FEE_RATE);
                    sendMessage(currentRoom, 'info', `${currentPlayer.name} 平多 ${holding.longQuantity} 手 ${futures.name}：${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}`);
                }
                if (holding.shortQuantity > 0) {
                    const shortNotional = futures.price * futures.unit * holding.shortQuantity;
                    const profit = (holding.shortAvgCost - futures.price) * futures.unit * holding.shortQuantity;
                    settlement += holding.shortInitialMargin + profit - Math.floor(shortNotional * FUTURES_FEE_RATE);
                    sendMessage(currentRoom, 'info', `${currentPlayer.name} 平空 ${holding.shortQuantity} 手 ${futures.name}：${profit >= 0 ? '获利' : '亏损'} $${Math.abs(Math.round(profit))}`);
                }
                if (settlement >= 0) {
                    addFunds(currentPlayer, settlement, 'deposit');
                }
                else if (!deductFunds(currentPlayer, -settlement, 'auto')) {
                    currentPlayer.isBankrupt = true;
                    sendMessage(currentRoom, 'error', `${currentPlayer.name} 期货平仓亏损超过可用资金，已破产`);
                }
                holding.longQuantity = 0;
                holding.longAvgCost = 0;
                holding.shortQuantity = 0;
                holding.shortAvgCost = 0;
                holding.shortInitialMargin = 0;
                holding.shortMaintenanceMargin = 0;
                break;
            }
        }
        broadcastRoomState(currentRoom);
        if (currentRoom.mode === 'singleplayer')
            checkSingleplayerWin(currentRoom);
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
