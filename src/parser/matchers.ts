import { NodeType } from '../types/ast'
import type { AttachmentItem } from '../types/ast'

/**
 * 正则匹配器：识别各级公文标题及特殊段落
 * 支持全角/半角括号容错
 */

const CHINESE_NUMERAL = '[零〇一二三四五六七八九十百千两]+'

// 一级标题：标准写法为「中文数字 + 顿号」，同时容错阿拉伯数字+顿号、中文数字+右括号
export const HEADING_1_RE = new RegExp(`^${CHINESE_NUMERAL}、`)
const HEADING_1_ARABIC_DUNHAO_RE = /^(\d+)、\s*/

// 二级标题：标准写法为「（中文数字）」，同时容错「一）」
const HEADING_2_RE = new RegExp(`^[（(]${CHINESE_NUMERAL}[）)]`)
const HEADING_2_CJK_NO_OPEN_RE = new RegExp(`^(${CHINESE_NUMERAL})[)）]\\s*`)

// 三级标题：阿拉伯数字 + 点号，如「1.」「12．」
const HEADING_3_RE = /^\d+[.．]/

// 四级标题：阿拉伯数字 + 括号，如「（1）」「(2)」
const HEADING_4_RE = /^[（(]\d+[）)]/

// 附件说明：以"附件"开头 + 全角/半角冒号
export const ATTACHMENT_RE = /^附件[：:]/

// 成文日期：纯日期行（严格匹配整行）
const DATE_RE = /^\d{4}年\d{1,2}月\d{1,2}日$/

export function arabicToChinese(num: number): string {
  if (!Number.isInteger(num) || num <= 0 || num > 9999) return String(num)

  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const units = ['', '十', '百', '千']
  const chars = String(num).split('').map(Number)
  let result = ''

  for (let i = 0; i < chars.length; i++) {
    const digit = chars[i]
    const unitIndex = chars.length - i - 1

    if (digit === 0) {
      if (result && !result.endsWith('零') && chars.slice(i + 1).some((value) => value !== 0)) {
        result += '零'
      }
      continue
    }

    if (!(digit === 1 && unitIndex === 1 && result === '')) {
      result += digits[digit]
    }
    result += units[unitIndex]
  }

  return result.replace(/零+$/g, '')
}

function normalizeHeading1(line: string): string {
  const standard = line.match(new RegExp(`^(${CHINESE_NUMERAL})、\\s*(.*)$`))
  if (standard) return `${standard[1]}、${standard[2]}`

  const arabic = line.match(/^(\d+)、\s*(.*)$/)
  if (arabic) return `${arabicToChinese(Number(arabic[1]))}、${arabic[2]}`

  const alt = line.match(new RegExp(`^(${CHINESE_NUMERAL})[)）]\\s*(.*)$`))
  if (alt) return `${alt[1]}、${alt[2]}`

  return line
}

function normalizeHeading2(line: string): string {
  const standard = line.match(new RegExp(`^[（(](${CHINESE_NUMERAL})[）)](?:、)?\\s*(.*)$`))
  if (standard) return `（${standard[1]}）${standard[2]}`

  const alt = line.match(new RegExp(`^(${CHINESE_NUMERAL})[)）]\\s*(.*)$`))
  if (alt) return `（${alt[1]}）${alt[2]}`

  return line
}

function normalizeHeading3(line: string): string {
  const match = line.match(/^(\d+)[.．]\s*(.*)$/)
  if (!match) return line
  return `${match[1]}.${match[2]}`
}

function normalizeHeading4(line: string): string {
  const match = line.match(/^[（(](\d+)[）)](?:、)?\s*(.*)$/)
  if (!match) return line
  return `（${match[1]}）${match[2]}`
}

function chineseToArabic(text: string): number | null {
  const normalized = text.replace(/两/g, '二').replace(/〇/g, '零')
  if (!normalized) return null

  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  const unitMap: Record<string, number> = {
    十: 10,
    百: 100,
    千: 1000,
  }

  let result = 0
  let section = 0
  let number = 0

  for (const char of normalized) {
    if (char in digitMap) {
      number = digitMap[char]
      continue
    }
    if (char in unitMap) {
      const unit = unitMap[char]
      section += (number || 1) * unit
      number = 0
      continue
    }
    return null
  }

  result += section + number
  return result > 0 ? result : null
}

interface HeadingOrdinalInfo {
  ordinal: number
  content: string
}

export function extractHeadingOrdinalInfo(type: NodeType, line: string): HeadingOrdinalInfo | null {
  const trimmed = line.trim()

  switch (type) {
    case NodeType.HEADING_1: {
      const chinese = trimmed.match(new RegExp(`^(${CHINESE_NUMERAL})、\\s*(.*)$`))
      if (chinese) {
        const ordinal = chineseToArabic(chinese[1])
        return ordinal ? { ordinal, content: chinese[2] } : null
      }
      const arabic = trimmed.match(/^(\d+)、\s*(.*)$/)
      if (arabic) return { ordinal: Number(arabic[1]), content: arabic[2] }
      const alt = trimmed.match(new RegExp(`^(${CHINESE_NUMERAL})[)）]\\s*(.*)$`))
      if (alt) {
        const ordinal = chineseToArabic(alt[1])
        return ordinal ? { ordinal, content: alt[2] } : null
      }
      return null
    }
    case NodeType.HEADING_2: {
      const standard = trimmed.match(new RegExp(`^[（(](${CHINESE_NUMERAL})[）)]\\s*(.*)$`))
      if (standard) {
        const ordinal = chineseToArabic(standard[1])
        return ordinal ? { ordinal, content: standard[2] } : null
      }
      const alt = trimmed.match(new RegExp(`^(${CHINESE_NUMERAL})[)）]\\s*(.*)$`))
      if (alt) {
        const ordinal = chineseToArabic(alt[1])
        return ordinal ? { ordinal, content: alt[2] } : null
      }
      return null
    }
    case NodeType.HEADING_3: {
      const match = trimmed.match(/^(\d+)[.．、]\s*(.*)$/)
      return match ? { ordinal: Number(match[1]), content: match[2] } : null
    }
    case NodeType.HEADING_4: {
      const match = trimmed.match(/^[（(](\d+)[）)](?:、)?\s*(.*)$/)
      return match ? { ordinal: Number(match[1]), content: match[2] } : null
    }
    default:
      return null
  }
}

export function normalizeNodeContent(type: NodeType, line: string): string {
  switch (type) {
    case NodeType.HEADING_1:
      return normalizeHeading1(line)
    case NodeType.HEADING_2:
      return normalizeHeading2(line)
    case NodeType.HEADING_3:
      return normalizeHeading3(line)
    case NodeType.HEADING_4:
      return normalizeHeading4(line)
    default:
      return line
  }
}

/**
 * 从单行文本中提取连续的附件项
 *
 * @param text 文本内容
 * @param startIndex 期望的起始序号
 * @returns 提取的附件项 + 剩余文本
 */
export function extractAttachmentItemsFromLine(
  text: string,
  startIndex: number
): { items: AttachmentItem[]; remaining: string } {
  const items: AttachmentItem[] = []
  let remaining = text
  let expectedIndex = startIndex

  while (remaining.length > 0) {
    // 尝试匹配期望序号的附件项
    const pattern = new RegExp(`^${expectedIndex}[.．．.]\\s*`)
    const match = remaining.match(pattern)

    if (!match) {
      break
    }

    // 移除序号和点号
    remaining = remaining.slice(match[0].length)

    // 查找下一个序号的位置，或到文本末尾
    const nextIndexPattern = /(?=\d+[.．．.])/
    const nextMatch = remaining.match(nextIndexPattern)

    let name: string
    if (nextMatch && nextMatch.index !== undefined) {
      name = remaining.slice(0, nextMatch.index).trim()
      remaining = remaining.slice(nextMatch.index)
    } else {
      name = remaining.trim()
      remaining = ''
    }

    items.push({ index: expectedIndex, name })
    expectedIndex++
  }

  return { items, remaining }
}

/**
 * 检测单行文本的节点类型（纯函数）
 * 不含标题判断逻辑，标题由 parser 层根据位置决定
 *
 * 优先级：ATTACHMENT → DATE → HEADING_1~4 → PARAGRAPH
 * 附件必须在标题之前匹配，避免"附件：1.xxx"误命中 HEADING_3
 */
export function detectNodeType(line: string): NodeType {
  const trimmed = line.trim()

  if (ATTACHMENT_RE.test(trimmed)) return NodeType.ATTACHMENT
  if (DATE_RE.test(trimmed)) return NodeType.DATE
  if (HEADING_1_ARABIC_DUNHAO_RE.test(trimmed)) return NodeType.HEADING_1
  if (HEADING_1_RE.test(trimmed)) return NodeType.HEADING_1
  if (HEADING_2_CJK_NO_OPEN_RE.test(trimmed)) return NodeType.HEADING_2
  if (HEADING_2_RE.test(trimmed)) return NodeType.HEADING_2
  if (HEADING_3_RE.test(trimmed)) return NodeType.HEADING_3
  if (HEADING_4_RE.test(trimmed)) return NodeType.HEADING_4

  return NodeType.PARAGRAPH
}
