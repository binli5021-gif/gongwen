import type { DocumentNode, GongwenAST, AttachmentNode } from '../types/ast'
import { NodeType } from '../types/ast'
import {
  arabicToChinese,
  detectNodeType,
  extractHeadingOrdinalInfo,
  normalizeNodeContent,
  HEADING_1_RE,
  ATTACHMENT_RE,
  extractAttachmentItemsFromLine,
} from './matchers'

/** 不应被识别为发文机关署名的结尾标点 */
const SIGNATURE_EXCLUDE_ENDINGS = ['。', '：', ':', '；', ';', '！', '!', '？', '?', '，', ',']
/** 机关署名常见关键词（用于降低正文误判） */
const SIGNATURE_ORG_HINTS = [
  '人民政府',
  '政府',
  '委员会',
  '居民委员会',
  '村民委员会',
  '居委会',
  '村委会',
  '办公厅',
  '办公室',
  '党委',
  '党组',
  '部',
  '厅',
  '局',
  '委',
  '院',
  '会',
  '集团',
  '公司',
  '中央',
  '街道',
  '社区',
  '管理区',
  '开发区',
  '新区',
  '中心',
  '工作站',
]

/**
 * 检查节点是否可能为发文机关署名
 * 条件：类型为 PARAGRAPH，内容长度不超过15字，不以特定标点结尾
 */
function isPossibleSignature(node: DocumentNode | undefined): boolean {
  if (!node || node.type !== NodeType.PARAGRAPH) return false
  const content = node.content.trim()
  if (content.length === 0 || content.length > 40) return false
  if (content.length > 15 && !hasSignatureOrgHint(content)) return false
  return !SIGNATURE_EXCLUDE_ENDINGS.some(ending => content.endsWith(ending))
}

/** 机关名称关键词检查（避免把普通短句识别为署名） */
function hasSignatureOrgHint(text: string): boolean {
  return SIGNATURE_ORG_HINTS.some((hint) => text.includes(hint))
}

/** 主送机关通常是标题后的短行，长段落即使以冒号结尾也应视为正文 */
const ADDRESSEE_MAX_LENGTH = 40

function isPossibleAddressee(line: string): boolean {
  if (!(line.endsWith('：') || line.endsWith(':'))) return false
  if (line.length > ADDRESSEE_MAX_LENGTH) return false
  if (HEADING_1_RE.test(line) || ATTACHMENT_RE.test(line)) return false
  return true
}

/** 构造单附件节点（保留原始文本，避免信息丢失） */
function buildSingleAttachmentNode(line: string, contentAfterColon: string, currentIndex: number): AttachmentNode {
  return {
    type: NodeType.ATTACHMENT,
    content: line,
    lineNumber: currentIndex + 1,
    isMultiple: false,
    items: [{ index: 0, name: normalizeAttachmentName(contentAfterColon) }],
  }
}

function normalizeAttachmentName(name: string): string {
  return name.trim().replace(/[。；;，,、：:]+$/g, '')
}

/**
 * 解析附件说明
 *
 * 单附件模式：附件：xxx（冒号后无数字或数字不是1）
 * 多附件模式：附件：1.xxx 2.xxx ...（冒号后紧跟数字1）
 */
function parseAttachment(
  line: string,
  lines: string[],
  currentIndex: number
): { node: AttachmentNode; nextIndex: number } {
  // 1. 提取冒号后的内容
  const colonMatch = line.match(/^附件[：:](.*)$/)
  if (!colonMatch) {
    throw new Error('Invalid attachment line')
  }
  const contentAfterColon = colonMatch[1].trim()

  // 2. 判断单附件还是多附件
  const firstItemMatch = contentAfterColon.match(/^(\d+)[.．．.]/)

  if (!firstItemMatch || firstItemMatch[1] !== '1') {
    // 单附件模式：冒号后不是 "1." 开头
    return {
      node: buildSingleAttachmentNode(line, contentAfterColon, currentIndex),
      nextIndex: currentIndex + 1,
    }
  }

  // 3. 多附件模式：收集所有附件项
  const items: AttachmentNode['items'] = []
  let remainingText = contentAfterColon
  let expectedIndex = 1
  // 记录已消费的最后一行索引（初始为当前行）
  let lastConsumedIndex = currentIndex

  while (true) {
    // 从当前文本中提取连续的附件项
    const { items: foundItems, remaining } = extractAttachmentItemsFromLine(
      remainingText,
      expectedIndex
    )

    // 当前行存在“部分可识别 + 剩余文本”时，不应吞掉剩余文本
    // 首行异常回退为单附件；后续行异常则不消费该行，交由主循环继续解析
    if (remaining.trim() !== '') {
      if (lastConsumedIndex === currentIndex) {
        return {
          node: buildSingleAttachmentNode(line, contentAfterColon, currentIndex),
          nextIndex: currentIndex + 1,
        }
      }
      return {
        node: {
          type: NodeType.ATTACHMENT,
          content: line,
          lineNumber: currentIndex + 1,
          isMultiple: true,
          items,
        },
        nextIndex: lastConsumedIndex,
      }
    }

    if (foundItems.length === 0) {
      if (lastConsumedIndex === currentIndex) {
        return {
          node: buildSingleAttachmentNode(line, contentAfterColon, currentIndex),
          nextIndex: currentIndex + 1,
        }
      }
      return {
        node: {
          type: NodeType.ATTACHMENT,
          content: line,
          lineNumber: currentIndex + 1,
          isMultiple: true,
          items,
        },
        nextIndex: lastConsumedIndex,
      }
    }

    items.push(...foundItems.map((item) => ({
      ...item,
      name: normalizeAttachmentName(item.name),
    })))
    expectedIndex += foundItems.length

    // 当前行的附件项已提取完毕，检查下一行是否有后续附件
    const nextLineIndex = lastConsumedIndex + 1
    if (nextLineIndex < lines.length) {
      const nextLine = lines[nextLineIndex].trim()
      // 跳过空行
      if (nextLine.length === 0) {
        lastConsumedIndex = nextLineIndex
        continue
      }
      // 检查下一行是否以期望的序号开头
      const nextItemMatch = nextLine.match(/^(\d+)[.．．.]/)
      if (nextItemMatch && Number(nextItemMatch[1]) === expectedIndex) {
        remainingText = nextLine
        lastConsumedIndex = nextLineIndex
        continue
      }
    }
    break
  }

  return {
    node: {
      type: NodeType.ATTACHMENT,
      content: line,
      lineNumber: currentIndex + 1,
      isMultiple: true,
      items,
    },
    nextIndex: lastConsumedIndex + 1,
  }
}

interface HeadingHarmonizeConfig {
  parentType: NodeType
  targetType: NodeType
  acceptedTypes: NodeType[]
  formatContent: (ordinal: number, content: string) => string
}

const HEADING_LEVEL_MAP: Record<NodeType, number> = {
  [NodeType.DOCUMENT_TITLE]: 0,
  [NodeType.HEADING_1]: 1,
  [NodeType.HEADING_2]: 2,
  [NodeType.HEADING_3]: 3,
  [NodeType.HEADING_4]: 4,
  [NodeType.PARAGRAPH]: 99,
  [NodeType.ADDRESSEE]: 99,
  [NodeType.ATTACHMENT]: 99,
  [NodeType.SIGNATURE]: 99,
  [NodeType.DATE]: 99,
}

function harmonizeHeadingLevel(body: DocumentNode[], config: HeadingHarmonizeConfig): DocumentNode[] {
  const normalized = [...body]
  let i = 0

  while (i < normalized.length) {
    if (normalized[i].type !== config.parentType) {
      i++
      continue
    }

    const parentInfo = extractHeadingOrdinalInfo(normalized[i].type, normalized[i].content)
    const candidates: Array<{ index: number; ordinal: number; content: string; type: NodeType }> = []
    let expectedChildOrdinal = 1
    let seenTargetType = false
    let j = i + 1

    for (; j < normalized.length; j++) {
      const node = normalized[j]

      if (node.type === config.parentType) {
        const info = extractHeadingOrdinalInfo(node.type, node.content)
        const isNextTopLevelHeading = Boolean(
          parentInfo &&
          info &&
          info.ordinal === parentInfo.ordinal + 1,
        )

        if (isNextTopLevelHeading) {
          break
        }
      }

      if (!config.acceptedTypes.includes(node.type)) {
        continue
      }

      if (
        seenTargetType &&
        HEADING_LEVEL_MAP[node.type] > HEADING_LEVEL_MAP[config.targetType]
      ) {
        continue
      }

      const info = extractHeadingOrdinalInfo(node.type, node.content)
      if (!info) continue
      if (info.ordinal !== expectedChildOrdinal) continue

      candidates.push({
        index: j,
        ordinal: info.ordinal,
        content: info.content,
        type: node.type,
      })
      if (node.type === config.targetType) {
        seenTargetType = true
      }
      expectedChildOrdinal++
    }

    if (candidates.length >= 2) {
      const hasMixedLevel = candidates.some((candidate) => candidate.type !== config.targetType)

      if (hasMixedLevel) {
        for (const candidate of candidates) {
          normalized[candidate.index] = {
            ...normalized[candidate.index],
            type: config.targetType,
            content: config.formatContent(candidate.ordinal, candidate.content),
          }
        }
      }
    }

    i = j
  }

  return normalized
}

function harmonizeHeadingHierarchy(body: DocumentNode[]): DocumentNode[] {
  const secondLevel = harmonizeHeadingLevel(body, {
    parentType: NodeType.HEADING_1,
    targetType: NodeType.HEADING_2,
    acceptedTypes: [NodeType.HEADING_1, NodeType.HEADING_2, NodeType.HEADING_3, NodeType.HEADING_4],
    formatContent: (ordinal, content) => `（${arabicToChinese(ordinal)}）${content}`,
  })

  const thirdLevel = harmonizeHeadingLevel(secondLevel, {
    parentType: NodeType.HEADING_2,
    targetType: NodeType.HEADING_3,
    acceptedTypes: [NodeType.HEADING_1, NodeType.HEADING_2, NodeType.HEADING_3, NodeType.HEADING_4],
    formatContent: (ordinal, content) => `${ordinal}.${content}`,
  })

  return harmonizeHeadingLevel(thirdLevel, {
    parentType: NodeType.HEADING_3,
    targetType: NodeType.HEADING_4,
    acceptedTypes: [NodeType.HEADING_1, NodeType.HEADING_3, NodeType.HEADING_4],
    formatContent: (ordinal, content) => `（${ordinal}）${content}`,
  })
}

/**
 * 将纯文本解析为公文 AST（纯函数）
 *
 * 规则:
 * 1. 跳过空行
 * 2. 第一个非空行视为公文标题（DOCUMENT_TITLE）
 * 3. 后续行通过正则检测类型
 * 4. 解析完成后识别发文机关署名：
 *    - 当 DATE 位于末尾，且 DATE 前一个段落满足“短句 + 机关关键词”时改为 SIGNATURE
 *    - 当文末只有单位署名、没有 DATE 时，若末尾段落满足“短句 + 机关关键词”也改为 SIGNATURE
 */
export function parseGongwen(text: string): GongwenAST {
  const lines = text.split('\n')
  let title: DocumentNode | null = null
  const body: DocumentNode[] = []

  let titleFound = false
  let addresseeChecked = false
  let i = 0

  while (i < lines.length) {
    const raw = lines[i]
    const trimmed = raw.trim()

    // 跳过空行
    if (trimmed.length === 0) {
      i++
      continue
    }

    const lineNumber = i + 1

    // 首个非空行 → 公文标题
    if (!titleFound) {
      title = { type: NodeType.DOCUMENT_TITLE, content: trimmed, lineNumber }
      titleFound = true
      i++
      continue
    }

    // 主送机关检测（标题后第一个非空行 + 冒号结尾 + 短行）
    if (!addresseeChecked) {
      addresseeChecked = true
      if (isPossibleAddressee(trimmed)) {
        body.push({ type: NodeType.ADDRESSEE, content: trimmed, lineNumber })
        i++
        continue
      }
    }

    // 附件说明检测
    if (ATTACHMENT_RE.test(trimmed)) {
      const { node, nextIndex } = parseAttachment(trimmed, lines, i)
      body.push(node)
      i = nextIndex
      continue
    }

    // 正则检测类型
    const type = detectNodeType(trimmed)
    body.push({ type, content: normalizeNodeContent(type, trimmed), lineNumber })
    i++
  }

  // 识别发文机关署名：优先处理“署名 + 日期”场景。
  for (let j = 1; j < body.length; j++) {
    if (body[j].type !== NodeType.DATE || j !== body.length - 1) continue
    if (isPossibleSignature(body[j - 1]) && hasSignatureOrgHint(body[j - 1].content)) {
      body[j - 1] = { ...body[j - 1], type: NodeType.SIGNATURE }
    }
  }

  // 兼容“只有单位、没有日期”的文末署名。
  const lastNode = body[body.length - 1]
  if (isPossibleSignature(lastNode) && hasSignatureOrgHint(lastNode.content)) {
    body[body.length - 1] = { ...lastNode, type: NodeType.SIGNATURE }
  }

  return { title, body: harmonizeHeadingHierarchy(body) }
}
