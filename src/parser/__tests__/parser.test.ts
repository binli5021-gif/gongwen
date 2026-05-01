import { describe, it, expect } from 'vitest'
import { parseGongwen } from '../parser'
import {
  detectNodeType,
  extractHeadingOrdinalInfo,
  extractAttachmentItemsFromLine,
  normalizeNodeContent,
} from '../matchers'
import { NodeType } from '../../types/ast'
import type { AttachmentNode } from '../../types/ast'

// ---- detectNodeType 单元测试 ----
describe('detectNodeType', () => {
  it('识别一级标题（中文数字+顿号）', () => {
    expect(detectNodeType('一、总体要求')).toBe(NodeType.HEADING_1)
    expect(detectNodeType('十二、附则')).toBe(NodeType.HEADING_1)
  })

  it('识别一级标题的非标准写法（阿拉伯数字+顿号）', () => {
    expect(detectNodeType('1、总体要求')).toBe(NodeType.HEADING_1)
    expect(detectNodeType('12、附则')).toBe(NodeType.HEADING_1)
  })

  it('识别二级标题（全角括号）', () => {
    expect(detectNodeType('（一）指导思想')).toBe(NodeType.HEADING_2)
    expect(detectNodeType('（十）保障措施')).toBe(NodeType.HEADING_2)
  })

  it('识别二级标题（半角括号容错）', () => {
    expect(detectNodeType('(一)指导思想')).toBe(NodeType.HEADING_2)
    expect(detectNodeType('(二)基本原则')).toBe(NodeType.HEADING_2)
  })

  it('识别二级标题的非标准写法（缺少左括号）', () => {
    expect(detectNodeType('一）指导思想')).toBe(NodeType.HEADING_2)
    expect(detectNodeType('二)基本原则')).toBe(NodeType.HEADING_2)
  })

  it('识别三级标题（阿拉伯数字+点号）', () => {
    expect(detectNodeType('1.加强组织领导')).toBe(NodeType.HEADING_3)
    expect(detectNodeType('12．完善制度体系')).toBe(NodeType.HEADING_3)
  })

  it('识别四级标题（阿拉伯数字+括号）', () => {
    expect(detectNodeType('（1）制定实施方案')).toBe(NodeType.HEADING_4)
    expect(detectNodeType('(2)明确责任分工')).toBe(NodeType.HEADING_4)
  })

  it('正文段落', () => {
    expect(detectNodeType('为深入贯彻落实党的二十大精神')).toBe(NodeType.PARAGRAPH)
    expect(detectNodeType('现就有关事项通知如下：')).toBe(NodeType.PARAGRAPH)
  })

  it('识别附件说明（全角冒号）', () => {
    expect(detectNodeType('附件：1.实施方案')).toBe(NodeType.ATTACHMENT)
  })

  it('识别附件说明（半角冒号容错）', () => {
    expect(detectNodeType('附件:2.责任清单')).toBe(NodeType.ATTACHMENT)
  })

  it('识别成文日期', () => {
    expect(detectNodeType('2025年10月21日')).toBe(NodeType.DATE)
    expect(detectNodeType('2026年1月5日')).toBe(NodeType.DATE)
  })

  it('非日期文本不误匹配为 DATE', () => {
    expect(detectNodeType('2025年工作计划')).toBe(NodeType.PARAGRAPH)
    expect(detectNodeType('2025年10月')).toBe(NodeType.PARAGRAPH)
  })
})

describe('normalizeNodeContent', () => {
  it('将非标准一级标题改写为标准格式', () => {
    expect(normalizeNodeContent(NodeType.HEADING_1, '1、总体要求')).toBe('一、总体要求')
    expect(normalizeNodeContent(NodeType.HEADING_1, '十二）附则')).toBe('十二、附则')
  })

  it('将二级标题统一为全角括号格式', () => {
    expect(normalizeNodeContent(NodeType.HEADING_2, '(一)指导思想')).toBe('（一）指导思想')
    expect(normalizeNodeContent(NodeType.HEADING_2, '二）基本原则')).toBe('（二）基本原则')
  })

  it('统一三级和四级标题的标点样式', () => {
    expect(normalizeNodeContent(NodeType.HEADING_3, '1．加强组织领导')).toBe('1.加强组织领导')
    expect(normalizeNodeContent(NodeType.HEADING_4, '(2)明确责任分工')).toBe('（2）明确责任分工')
  })
})

describe('extractHeadingOrdinalInfo', () => {
  it('提取混合写法标题的序号和正文', () => {
    expect(extractHeadingOrdinalInfo(NodeType.HEADING_1, '2、协调机制')).toEqual({
      ordinal: 2,
      content: '协调机制',
    })
    expect(extractHeadingOrdinalInfo(NodeType.HEADING_4, '（3）、协同联动')).toEqual({
      ordinal: 3,
      content: '协同联动',
    })
  })
})

// ---- parseGongwen 单元测试 ----
describe('parseGongwen', () => {
  it('空文本返回空 AST', () => {
    const ast = parseGongwen('')
    expect(ast.title).toBeNull()
    expect(ast.body).toHaveLength(0)
  })

  it('仅空行返回空 AST', () => {
    const ast = parseGongwen('\n\n  \n')
    expect(ast.title).toBeNull()
    expect(ast.body).toHaveLength(0)
  })

  it('第一个非空行识别为公文标题', () => {
    const ast = parseGongwen('关于加强安全生产工作的通知')
    expect(ast.title).not.toBeNull()
    expect(ast.title!.type).toBe(NodeType.DOCUMENT_TITLE)
    expect(ast.title!.content).toBe('关于加强安全生产工作的通知')
    expect(ast.title!.lineNumber).toBe(1)
  })

  it('跳过空行后识别标题', () => {
    const ast = parseGongwen('\n\n关于加强安全生产工作的通知')
    expect(ast.title!.lineNumber).toBe(3)
  })

  it('完整公文解析', () => {
    const text = [
      '关于加强安全生产工作的通知',
      '',
      '一、总体要求',
      '为深入贯彻落实党的二十大精神，现就有关事项通知如下。',
      '（一）指导思想',
      '坚持以习近平新时代中国特色社会主义思想为指导。',
      '1.加强组织领导',
      '（1）制定实施方案',
      '各部门要高度重视安全生产工作。',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.title!.type).toBe(NodeType.DOCUMENT_TITLE)
    expect(ast.title!.content).toBe('关于加强安全生产工作的通知')

    expect(ast.body).toHaveLength(7)
    expect(ast.body[0].type).toBe(NodeType.HEADING_1)
    expect(ast.body[1].type).toBe(NodeType.PARAGRAPH)
    expect(ast.body[2].type).toBe(NodeType.HEADING_2)
    expect(ast.body[3].type).toBe(NodeType.PARAGRAPH)
    expect(ast.body[4].type).toBe(NodeType.HEADING_3)
    expect(ast.body[5].type).toBe(NodeType.HEADING_4)
    expect(ast.body[6].type).toBe(NodeType.PARAGRAPH)
  })

  it('会将非标准一级、二级标题改写成标准格式后再排版', () => {
    const text = [
      '关于加强安全生产工作的通知',
      '',
      '1、总体要求',
      '为深入贯彻落实党的二十大精神，现就有关事项通知如下。',
      '(一)指导思想',
      '坚持以习近平新时代中国特色社会主义思想为指导。',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.body[0]).toMatchObject({
      type: NodeType.HEADING_1,
      content: '一、总体要求',
    })
    expect(ast.body[2]).toMatchObject({
      type: NodeType.HEADING_2,
      content: '（一）指导思想',
    })
  })

  it('会将一级标题下混写的次级标题统一纠偏为标准二级标题', () => {
    const text = [
      '关于建立联防联动机制的通知',
      '',
      '二、协调联动机制',
      '（1）、联络互通。',
      '根据工作需要，明确联络人。',
      '2、信息共享。',
      '及时通报有关情况。',
      '(3)协同联动。',
      '加强协同处置。',
      '（四）队伍共建。',
      '加强队伍建设。',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.body[0].content).toBe('二、协调联动机制')
    expect(ast.body[1]).toMatchObject({
      type: NodeType.HEADING_2,
      content: '（一）联络互通。',
    })
    expect(ast.body[3]).toMatchObject({
      type: NodeType.HEADING_2,
      content: '（二）信息共享。',
    })
    expect(ast.body[5]).toMatchObject({
      type: NodeType.HEADING_2,
      content: '（三）协同联动。',
    })
    expect(ast.body[7]).toMatchObject({
      type: NodeType.HEADING_2,
      content: '（四）队伍共建。',
    })
  })

  it('会将二级标题下混写的次级标题统一纠偏为标准三级标题', () => {
    const text = [
      '关于建立联防联动机制的通知',
      '',
      '一、总体要求',
      '（一）工作原则',
      '（1）统一指挥。',
      '坚持统一指挥调度。',
      '2、分级负责。',
      '按照职责分工落实责任。',
      '(3)快速响应。',
      '提升处置效率。',
      '4.协同联动。',
      '形成工作合力。',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.body[1].content).toBe('（一）工作原则')
    expect(ast.body[2]).toMatchObject({
      type: NodeType.HEADING_3,
      content: '1.统一指挥。',
    })
    expect(ast.body[4]).toMatchObject({
      type: NodeType.HEADING_3,
      content: '2.分级负责。',
    })
    expect(ast.body[6]).toMatchObject({
      type: NodeType.HEADING_3,
      content: '3.快速响应。',
    })
    expect(ast.body[8]).toMatchObject({
      type: NodeType.HEADING_3,
      content: '4.协同联动。',
    })
  })

  it('会将三级标题下混写的次级标题统一纠偏为标准四级标题', () => {
    const text = [
      '关于建立联防联动机制的通知',
      '',
      '一、总体要求',
      '（一）工作原则',
      '1.加强统筹。',
      '1、健全机制。',
      '完善制度安排。',
      '(2)明确分工。',
      '压实岗位责任。',
      '3.强化落实。',
      '确保措施落地。',
      '（4）跟踪问效。',
      '形成闭环管理。',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.body[2].content).toBe('1.加强统筹。')
    expect(ast.body[3]).toMatchObject({
      type: NodeType.HEADING_4,
      content: '（1）健全机制。',
    })
    expect(ast.body[5]).toMatchObject({
      type: NodeType.HEADING_4,
      content: '（2）明确分工。',
    })
    expect(ast.body[7]).toMatchObject({
      type: NodeType.HEADING_4,
      content: '（3）强化落实。',
    })
    expect(ast.body[9]).toMatchObject({
      type: NodeType.HEADING_4,
      content: '（4）跟踪问效。',
    })
  })

  it('正确记录行号', () => {
    const text = '标题\n\n一、正文第一节\n内容段落'
    const ast = parseGongwen(text)

    expect(ast.title!.lineNumber).toBe(1)
    expect(ast.body[0].lineNumber).toBe(3)
    expect(ast.body[1].lineNumber).toBe(4)
  })

  it('识别主送机关（标题后以冒号结尾的第一行）', () => {
    const text = [
      '关于加强安全生产工作的通知',
      '',
      '各省、自治区、直辖市人民政府：',
      '一、总体要求',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.title!.type).toBe(NodeType.DOCUMENT_TITLE)
    expect(ast.body[0].type).toBe(NodeType.ADDRESSEE)
    expect(ast.body[0].content).toBe('各省、自治区、直辖市人民政府：')
    expect(ast.body[1].type).toBe(NodeType.HEADING_1)
  })

  it('主送机关仅触发一次（第二个冒号结尾行不匹配）', () => {
    const text = [
      '关于工作的通知',
      '各单位：',
      '现就有关事项通知如下：',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.body[0].type).toBe(NodeType.ADDRESSEE)
    expect(ast.body[1].type).toBe(NodeType.PARAGRAPH) // 第二个冒号行为普通段落
  })

  it('标题后过长的冒号结尾行按正文处理，不误判为主送机关', () => {
    const text = [
      '关于进一步规范劳务派遣单位参加工伤保险有关工作的通知',
      '',
      '为进一步规范劳务派遣单位参加工伤保险工作，切实维护社会保险基金安全和劳动者合法权益，依据《中华人民共和国社会保险法》、《工伤保险条例》、《劳务派遣暂行规定》等相关规定，结合工作实际，现就有关问题通知如下：',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.body[0].type).toBe(NodeType.PARAGRAPH)
  })

  it('完整公文含主送机关、附件、日期的端到端解析', () => {
    const text = [
      '关于做好2025年安全生产工作的通知',
      '',
      '各省、自治区、直辖市人民政府：',
      '一、总体要求',
      '坚持安全第一、预防为主。',
      '附件：1.实施方案',
      '2025年10月21日',
    ].join('\n')

    const ast = parseGongwen(text)

    expect(ast.title!.type).toBe(NodeType.DOCUMENT_TITLE)
    expect(ast.title!.content).toBe('关于做好2025年安全生产工作的通知')

    expect(ast.body).toHaveLength(5)
    expect(ast.body[0].type).toBe(NodeType.ADDRESSEE)
    expect(ast.body[1].type).toBe(NodeType.HEADING_1)
    expect(ast.body[2].type).toBe(NodeType.PARAGRAPH)
    expect(ast.body[3].type).toBe(NodeType.ATTACHMENT)
    expect(ast.body[4].type).toBe(NodeType.DATE)
  })
})

// ---- extractAttachmentItemsFromLine 单元测试 ----
describe('extractAttachmentItemsFromLine', () => {
  it('提取单个附件项', () => {
    const result = extractAttachmentItemsFromLine('1.实施方案', 1)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({ index: 1, name: '实施方案' })
    expect(result.remaining).toBe('')
  })

  it('提取多个连续附件项', () => {
    const result = extractAttachmentItemsFromLine('1.方案A 2.方案B 3.方案C', 1)
    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toEqual({ index: 1, name: '方案A' })
    expect(result.items[1]).toEqual({ index: 2, name: '方案B' })
    expect(result.items[2]).toEqual({ index: 3, name: '方案C' })
    expect(result.remaining).toBe('')
  })

  it('序号不连续时停止提取', () => {
    const result = extractAttachmentItemsFromLine('1.方案A 2.方案B 4.方案D', 1)
    expect(result.items).toHaveLength(2)
    expect(result.remaining).toBe('4.方案D')
  })

  it('支持不同点号格式', () => {
    const result = extractAttachmentItemsFromLine('1．实施方案 2.责任清单', 1)
    expect(result.items).toHaveLength(2)
    expect(result.items[0].name).toBe('实施方案')
    expect(result.items[1].name).toBe('责任清单')
  })
})

// ---- 附件说明解析测试 ----
describe('附件说明解析', () => {
  describe('单附件模式', () => {
    it('识别单附件（冒号后无数字）', () => {
      const text = '标题\n\n附件：关于开展2025年安全生产专项检查的实施方案'
      const ast = parseGongwen(text)

      expect(ast.body[0].type).toBe(NodeType.ATTACHMENT)
      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(false)
      expect(node.items).toHaveLength(1)
      expect(node.items[0].index).toBe(0)
      expect(node.items[0].name).toBe('关于开展2025年安全生产专项检查的实施方案')
    })

    it('单附件冒号后有空格也能识别', () => {
      const text = '标题\n\n附件： 实施方案'
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(false)
      expect(node.items[0].name).toBe('实施方案')
    })

    it('单附件名称末尾标点会自动清理', () => {
      const text = '标题\n\n附件：第一人称的格式。'
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.items[0].name).toBe('第一人称的格式')
    })

    it('冒号后数字不是1时视为单附件', () => {
      const text = '标题\n\n附件：2.责任清单'
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(false)
      expect(node.items[0].name).toBe('2.责任清单')
    })
  })

  describe('多附件模式', () => {
    it('识别多附件（同行多数字）', () => {
      const text = '标题\n\n附件：1.实施方案 2.责任清单 3.工作计划'
      const ast = parseGongwen(text)

      expect(ast.body[0].type).toBe(NodeType.ATTACHMENT)
      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(true)
      expect(node.items).toHaveLength(3)
      expect(node.items[0]).toEqual({ index: 1, name: '实施方案' })
      expect(node.items[1]).toEqual({ index: 2, name: '责任清单' })
      expect(node.items[2]).toEqual({ index: 3, name: '工作计划' })
    })

    it('识别多附件（分行数字）', () => {
      const text = [
        '标题',
        '',
        '附件：1.实施方案',
        '2.责任清单',
        '3.工作计划',
      ].join('\n')
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(true)
      expect(node.items).toHaveLength(3)
    })

    it('识别多附件（混合格式）', () => {
      const text = [
        '标题',
        '',
        '附件：1.实施方案 2.责任清单',
        '3.工作计划',
      ].join('\n')
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(true)
      expect(node.items).toHaveLength(3)
    })

    it('序号不连续时停止解析（同行剩余内容作为附件说明的一部分）', () => {
      const text = '标题\n\n附件：1.方案A 2.方案B 4.方案D'
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      // 同行异常回退为单附件，保留原始文本避免丢字
      expect(node.isMultiple).toBe(false)
      expect(node.items).toHaveLength(1)
      expect(node.items[0].name).toBe('1.方案A 2.方案B 4.方案D')
      expect(ast.body).toHaveLength(1)
    })

    it('序号不连续时停止解析（分行情况）', () => {
      const text = [
        '标题',
        '',
        '附件：1.方案A 2.方案B',
        '4.方案D',
      ].join('\n')
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.items).toHaveLength(2)
      // 分行的 "4.方案D" 应该被解析为三级标题
      expect(ast.body[1].type).toBe(NodeType.HEADING_3)
    })

    it('后续行异常时不吞掉原文（异常行继续由主循环解析）', () => {
      const text = [
        '标题',
        '',
        '附件：1.方案A',
        '2.方案B 4.方案D',
      ].join('\n')
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.isMultiple).toBe(true)
      expect(node.items).toHaveLength(1)
      expect(node.items[0]).toEqual({ index: 1, name: '方案A' })
      expect(ast.body[1].type).toBe(NodeType.HEADING_3)
      expect(ast.body[1].content).toBe('2.方案B 4.方案D')
    })

    it('支持不同点号格式', () => {
      const text = '标题\n\n附件：1．实施方案 2.责任清单'
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.items).toHaveLength(2)
    })

    it('多附件名称末尾标点会自动清理', () => {
      const text = '标题\n\n附件：1.实施方案。 2.责任清单；'
      const ast = parseGongwen(text)

      const node = ast.body[0] as AttachmentNode
      expect(node.items[0].name).toBe('实施方案')
      expect(node.items[1].name).toBe('责任清单')
    })

    it('多附件后正确解析后续内容', () => {
      const text = [
        '标题',
        '',
        '附件：1.实施方案 2.责任清单',
        '2025年10月21日',
      ].join('\n')
      const ast = parseGongwen(text)

      expect(ast.body).toHaveLength(2)
      expect(ast.body[0].type).toBe(NodeType.ATTACHMENT)
      expect(ast.body[1].type).toBe(NodeType.DATE)
    })
  })
})

// ---- 发文机关署名识别测试 ----
describe('发文机关署名识别', () => {
  it('末尾日期前的机关名称识别为 SIGNATURE', () => {
    const text = [
      '标题',
      '',
      '国务院办公厅',
      '2025年10月21日',
    ].join('\n')
    const ast = parseGongwen(text)

    expect(ast.body).toHaveLength(2)
    expect(ast.body[0].type).toBe(NodeType.SIGNATURE)
    expect(ast.body[1].type).toBe(NodeType.DATE)
  })

  it('基层单位名称也识别为 SIGNATURE', () => {
    const text = [
      '标题',
      '',
      '珠海市香洲区湾仔街道桂园社区居委会',
      '2026年5月1日',
    ].join('\n')
    const ast = parseGongwen(text)

    expect(ast.body).toHaveLength(2)
    expect(ast.body[0].type).toBe(NodeType.SIGNATURE)
    expect(ast.body[1].type).toBe(NodeType.DATE)
  })

  it('文末只有单位没有日期时也识别为 SIGNATURE', () => {
    const text = [
      '标题',
      '',
      '一、有关要求',
      '请各单位认真抓好落实。',
      '国务院办公厅',
    ].join('\n')
    const ast = parseGongwen(text)

    expect(ast.body).toHaveLength(3)
    expect(ast.body[0].type).toBe(NodeType.HEADING_1)
    expect(ast.body[1].type).toBe(NodeType.PARAGRAPH)
    expect(ast.body[2].type).toBe(NodeType.SIGNATURE)
  })

  it('日期非末尾时不识别 SIGNATURE', () => {
    const text = [
      '标题',
      '',
      '国务院办公厅',
      '2025年10月21日',
      '一、后续说明',
    ].join('\n')
    const ast = parseGongwen(text)

    expect(ast.body[0].type).toBe(NodeType.PARAGRAPH)
    expect(ast.body[1].type).toBe(NodeType.DATE)
    expect(ast.body[2].type).toBe(NodeType.HEADING_1)
  })

  it('普通短句不应误识别为 SIGNATURE', () => {
    const text = [
      '标题',
      '',
      '请认真执行',
      '2025年10月21日',
    ].join('\n')
    const ast = parseGongwen(text)

    expect(ast.body[0].type).toBe(NodeType.PARAGRAPH)
    expect(ast.body[1].type).toBe(NodeType.DATE)
  })

  it('文末普通短句即使没有日期也不误识别为 SIGNATURE', () => {
    const text = [
      '标题',
      '',
      '一、有关要求',
      '请认真执行',
    ].join('\n')
    const ast = parseGongwen(text)

    expect(ast.body[0].type).toBe(NodeType.HEADING_1)
    expect(ast.body[1].type).toBe(NodeType.PARAGRAPH)
  })
})
