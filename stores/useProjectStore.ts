import { create } from 'zustand';
import { Project, FileNode } from '../types';

// Mock workspace files
const MOCK_FILE_TREE: FileNode[] = [
  {
    name: 'app',
    path: '/app',
    isFolder: true,
    children: [
      {
        name: 'page.tsx',
        path: '/app/page.tsx',
        isFolder: false,
        originalContent: `import React from 'react';\nimport { Dashboard } from '@/components/Dashboard';\n\nexport default function Page() {\n  return (\n    <main className="min-h-screen bg-slate-950 text-white p-6">\n      <h1 className="text-xl font-bold">Welcome to GravityX</h1>\n      <p>Let's build something epic.</p>\n    </main>\n  );\n}`,
        content: `import React from 'react';\nimport { Dashboard } from '@/components/Dashboard';\n\nexport default function Page() {\n  return (\n    <main className="min-h-screen bg-slate-950 text-white p-6">\n      <h1 className="text-xl font-bold">Welcome to GravityX</h1>\n      <p>Let's build something epic.</p>\n    </main>\n  );\n}`
      },
      {
        name: 'layout.tsx',
        path: '/app/layout.tsx',
        isFolder: false,
        originalContent: `export default function Layout({ children }: { children: React.ReactNode }) {\n  return <div className="dark">{children}</div>;\n}`,
        content: `export default function Layout({ children }: { children: React.ReactNode }) {\n  return <div className="dark">{children}</div>;\n}`
      }
    ]
  },
  {
    name: 'components',
    path: '/components',
    isFolder: true,
    children: [
      {
        name: 'Button.tsx',
        path: '/components/Button.tsx',
        isFolder: false,
        originalContent: `import React from 'react';\n\nexport const Button = () => {\n  return <button className="px-4 py-2 bg-blue-600 rounded">Click me</button>;\n};`,
        content: `import React from 'react';\n\nexport const Button = () => {\n  return (\n    <button className="px-4 py-2 bg-violet-600 hover:bg-violet-700 transition duration-200 text-white font-medium rounded-lg shadow-lg hover:shadow-violet-500/20 active:scale-95">\n      Click me\n    </button>\n  );\n};`
      }
    ]
  },
  {
    name: 'package.json',
    path: '/package.json',
    isFolder: false,
    originalContent: `{\n  "name": "gravity-x",\n  "version": "0.1.0",\n  "dependencies": {\n    "next": "latest"\n  }\n}`,
    content: `{\n  "name": "gravity-x",\n  "version": "0.1.0",\n  "dependencies": {\n    "next": "latest"\n  }\n}`
  }
];

const MOCK_PROJECTS: Project[] = [
  {
    id: 'gravityx-core',
    name: 'gravityx-core',
    description: 'Core repository containing frontend UI and backend adapter hooks.',
    createdAt: new Date().toISOString(),
    fileTree: MOCK_FILE_TREE,
  },
  {
    id: 'gravityx-agent-cli',
    name: 'gravityx-agent-cli',
    description: 'Command line tool for orchestrating multi-agent tasks locally.',
    createdAt: new Date().toISOString(),
    fileTree: [
      {
        name: 'bin',
        path: '/bin',
        isFolder: true,
        children: [
          { name: 'cli.js', path: '/bin/cli.js', isFolder: false, content: '// CLI core execution', originalContent: '// CLI core execution' }
        ]
      },
      { name: 'package.json', path: '/package.json', isFolder: false, content: '{"name": "gravityx-cli"}', originalContent: '{"name": "gravityx-cli"}' }
    ]
  }
];

interface ProjectState {
  projects: Project[];
  activeProjectId: string;
  activeFilePath: string | null;
  activeFileContent: string;
  activeFileOriginalContent: string;
  isEditing: boolean;
  setActiveProject: (projectId: string) => void;
  setActiveFile: (filePath: string | null) => void;
  updateFileContent: (content: string) => void;
  saveFile: () => void;
  createNewProject: (name: string, description: string) => void;
  addFileToTree: (parentPath: string | null, node: FileNode) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: MOCK_PROJECTS,
  activeProjectId: 'gravityx-core',
  activeFilePath: '/app/page.tsx',
  activeFileContent: MOCK_FILE_TREE[0].children![0].content || '',
  activeFileOriginalContent: MOCK_FILE_TREE[0].children![0].originalContent || '',
  isEditing: false,
  setActiveProject: (projectId) => {
    const project = get().projects.find(p => p.id === projectId);
    if (!project) return;
    
    // Find first leaf node (file) in project tree
    let firstFile: FileNode | null = null;
    const findFirstFile = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (!node.isFolder) {
          firstFile = node;
          break;
        }
        if (node.children) {
          findFirstFile(node.children);
          if (firstFile) break;
        }
      }
    };
    findFirstFile(project.fileTree);
    
    set({
      activeProjectId: projectId,
      activeFilePath: firstFile ? (firstFile as FileNode).path : null,
      activeFileContent: firstFile ? ((firstFile as FileNode).content || '') : '',
      activeFileOriginalContent: firstFile ? ((firstFile as FileNode).originalContent || '') : '',
      isEditing: false
    });
  },
  setActiveFile: (filePath) => {
    if (!filePath) {
      set({ activeFilePath: null, activeFileContent: '', activeFileOriginalContent: '', isEditing: false });
      return;
    }
    
    const project = get().projects.find(p => p.id === get().activeProjectId);
    if (!project) return;

    let targetNode: FileNode | null = null;
    const findFile = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.path === filePath && !node.isFolder) {
          targetNode = node;
          break;
        }
        if (node.children) {
          findFile(node.children);
          if (targetNode) break;
        }
      }
    };
    
    findFile(project.fileTree);
    
    if (targetNode) {
      set({
        activeFilePath: filePath,
        activeFileContent: (targetNode as FileNode).content || '',
        activeFileOriginalContent: (targetNode as FileNode).originalContent || '',
        isEditing: false
      });
    }
  },
  updateFileContent: (content) => {
    set({ activeFileContent: content, isEditing: true });
  },
  saveFile: () => {
    const { activeProjectId, activeFilePath, activeFileContent, projects } = get();
    if (!activeFilePath) return;

    const updatedProjects = projects.map(p => {
      if (p.id !== activeProjectId) return p;

      const updateNode = (nodes: FileNode[]): FileNode[] => {
        return nodes.map(n => {
          if (n.path === activeFilePath) {
            return { ...n, content: activeFileContent, originalContent: activeFileContent };
          }
          if (n.children) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      };

      return { ...p, fileTree: updateNode(p.fileTree) };
    });

    set({
      projects: updatedProjects,
      activeFileOriginalContent: activeFileContent,
      isEditing: false
    });
  },
  createNewProject: (name, description) => {
    const newProj: Project = {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      description,
      createdAt: new Date().toISOString(),
      fileTree: [
        { name: 'README.md', path: '/README.md', isFolder: false, content: `# ${name}\n\n${description}`, originalContent: `# ${name}\n\n${description}` }
      ]
    };
    set(state => ({
      projects: [...state.projects, newProj],
      activeProjectId: newProj.id,
      activeFilePath: '/README.md',
      activeFileContent: newProj.fileTree[0].content || '',
      activeFileOriginalContent: newProj.fileTree[0].originalContent || '',
      isEditing: false
    }));
  },
  addFileToTree: (parentPath, node) => {
    const { activeProjectId, projects } = get();
    const updatedProjects = projects.map(p => {
      if (p.id !== activeProjectId) return p;

      if (!parentPath) {
        return { ...p, fileTree: [...p.fileTree, node] };
      }

      const insertNode = (nodes: FileNode[]): FileNode[] => {
        return nodes.map(n => {
          if (n.path === parentPath && n.isFolder) {
            return { ...n, children: [...(n.children || []), node] };
          }
          if (n.children) {
            return { ...n, children: insertNode(n.children) };
          }
          return n;
        });
      };

      return { ...p, fileTree: insertNode(p.fileTree) };
    });

    set({ projects: updatedProjects });
    if (!node.isFolder) {
      get().setActiveFile(node.path);
    }
  }
}));
