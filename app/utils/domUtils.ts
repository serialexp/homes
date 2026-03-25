/**
 * Generate a tree representation of a DOM document or element
 */
export function generateDomTree(node: Node, depth: number = 0, maxDepth: number = 10, maxChildren: number = 20): DomTreeNode {
  // Prevent infinite recursion or excessive depth
  if (depth > maxDepth) {
    return {
      type: 'truncated',
      name: '... (max depth reached)',
      depth
    };
  }

  // Handle different node types
  if (node.nodeType === 1) { // Element node
    const element = node as Element;
    const attributes: Record<string, string> = {};
    
    // Get attributes
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attributes[attr.nodeName] = attr.nodeValue || '';
      }
    }
    
    // Get children
    const children: DomTreeNode[] = [];
    let childCount = 0;
    let truncated = false;
    
    if (element.childNodes) {
      for (let i = 0; i < element.childNodes.length; i++) {
        if (childCount >= maxChildren) {
          children.push({
            type: 'truncated',
            name: `... (${element.childNodes.length - childCount} more children)`,
            depth: depth + 1
          });
          truncated = true;
          break;
        }
        
        const child = element.childNodes[i];
        
        // Skip empty text nodes (whitespace)
        if (child.nodeType === 3 && (!child.nodeValue || child.nodeValue.trim() === '')) {
          continue;
        }
        
        children.push(generateDomTree(child, depth + 1, maxDepth, maxChildren));
        childCount++;
      }
    }
    
    return {
      type: 'element',
      name: element.nodeName,
      attributes,
      children,
      truncated,
      depth
    };
  } else if (node.nodeType === 3) { // Text node
    const text = node.nodeValue || '';
    const trimmed = text.trim();
    
    // Skip empty text nodes
    if (trimmed === '') {
      return {
        type: 'text',
        name: '(empty text)',
        value: '',
        depth
      };
    }
    
    // Truncate long text
    const displayText = trimmed.length > 50 ? trimmed.substring(0, 47) + '...' : trimmed;
    
    return {
      type: 'text',
      name: 'TEXT',
      value: displayText,
      depth
    };
  } else if (node.nodeType === 8) { // Comment node
    const comment = node.nodeValue || '';
    const displayComment = comment.length > 50 ? comment.substring(0, 47) + '...' : comment;
    
    return {
      type: 'comment',
      name: 'COMMENT',
      value: displayComment,
      depth
    };
  } else if (node.nodeType === 9) { // Document node
    const docNode = node as Document;
    const children: DomTreeNode[] = [];
    
    // Add document element
    if (docNode.documentElement) {
      children.push(generateDomTree(docNode.documentElement, depth + 1, maxDepth, maxChildren));
    }
    
    return {
      type: 'document',
      name: '#document',
      children,
      depth
    };
  } else {
    // Other node types
    return {
      type: 'other',
      name: `Node(${node.nodeType})`,
      depth
    };
  }
}

/**
 * Format a DOM tree as a string with indentation
 */
export function formatDomTree(tree: DomTreeNode, indentSize: number = 2): string {
  const indent = ' '.repeat(indentSize * tree.depth);
  
  if (tree.type === 'element') {
    // Format element with attributes
    const attrs = tree.attributes ? Object.entries(tree.attributes)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ') : '';
    
    const elementStr = attrs ? `<${tree.name} ${attrs}>` : `<${tree.name}>`;
    
    if (!tree.children || tree.children.length === 0) {
      return `${indent}${elementStr}`;
    }
    
    // Format children
    const childrenStr = tree.children
      .map(child => formatDomTree(child, indentSize))
      .join('\n');
    
    return `${indent}${elementStr}\n${childrenStr}`;
  } else if (tree.type === 'text') {
    return `${indent}"${tree.value}"`;
  } else if (tree.type === 'comment') {
    return `${indent}<!-- ${tree.value} -->`;
  } else if (tree.type === 'document') {
    if (!tree.children || tree.children.length === 0) {
      return `${indent}#document (empty)`;
    }
    
    const childrenStr = tree.children
      .map(child => formatDomTree(child, indentSize))
      .join('\n');
    
    return `${indent}#document\n${childrenStr}`;
  } else if (tree.type === 'truncated') {
    return `${indent}${tree.name}`;
  } else {
    return `${indent}${tree.name}`;
  }
}

/**
 * DOM Tree Node interface
 */
export interface DomTreeNode {
  type: 'element' | 'text' | 'comment' | 'document' | 'other' | 'truncated';
  name: string;
  depth: number;
  attributes?: Record<string, string>;
  children?: DomTreeNode[];
  value?: string;
  truncated?: boolean;
} 