import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
} from '@mui/material';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  ReactFlowProvider,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './App.css';
import { toPng } from 'html-to-image';
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import firebaseConfig from './firebaseConfig'; // Import the config
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import CSVUpload from './components/CSVUpload'; // Adjust path if needed


const app = initializeApp(firebaseConfig); // Initialize Firebase
const auth = getAuth(app); // Get auth instance
const googleProvider = new GoogleAuthProvider(); // Google Auth Provider
const db = getFirestore(app);

const nodeColor = (level) => {
  const colors = ['#e1bee7', '#ce93d8', '#ba68c8', '#9c27b0', '#7b1fa2', '#4a148c'];
  return colors[level % colors.length] || '#673ab7';
};

const positionNodes = (nodes) => {
  const nodesByLevel = {};
  nodes.forEach(node => {
    const level = node.position.y / 100;
    if (!nodesByLevel[level]) {
      nodesByLevel[level] = [];
    }
    nodesByLevel[level].push(node);
  });

  for (const level in nodesByLevel) {
    const levelNodes = nodesByLevel[level];
    const spacing = 150;
    const totalWidth = (levelNodes.length - 1) * spacing;
    const startX = -totalWidth / 2;

    levelNodes.forEach((node, index) => {
      node.position.x = startX + index * spacing;
    });
  }
  return nodes;
};

const generateUpwardHierarchyData = (person, stages, tree) => {
  const nodes = [];
  const edges = [];
  let currentPersons = [{ name: person, level: 0, id: person }];
  const visited = new Set([person]);

  nodes.push({
    id: person,
    data: { label: person },
    position: { x: 0, y: 0 },
    style: {
      backgroundColor: nodeColor(0),
      borderRadius: '8px',
      boxShadow: '2px 2px 5px rgba(0, 0, 0, 0.2)',
      border: '1px solid #ccc',
      padding: '10px',
    },
  });

  for (let i = 1; i <= stages; i++) {
    const nextParents = [];
    for (const p of currentPersons) {
      for (const parent in tree) {
        if (tree[parent] && tree[parent].includes(p.name) && !visited.has(parent)) {
          if (!nodes.find(node => node.id === parent)) {
            const yPos = -i * 100;
            const parentId = parent;
            nodes.push({
              id: parentId,
              data: { label: parent },
              position: { x: 0, y: yPos },
              style: {
                backgroundColor: nodeColor(i),
                borderRadius: '8px',
                boxShadow: '2px 2px 5px rgba(0, 0, 0, 0.2)',
                border: '1px solid #ccc',
                padding: '10px',
              },
            });
          }
          const edge = {
            id: `${parent}-${p.name}`,
            source: parent,
            target: p.name,
            style: { stroke: '#888', strokeWidth: 2 },
            animated: true,
          };
          edges.push(edge);
          nextParents.push({ name: parent, level: i, id: parent });
          visited.add(parent);
        }
      }
      if (nextParents.length === 0) break;
      currentPersons = nextParents;
    }
  }
  return { nodes, edges };
};

const generateDownwardHierarchyData = (person, stages, tree) => {
  const nodes = [];
  const edges = [];
  let currentPersons = [{ name: person, level: 0, id: person }];
  const visited = new Set([person]);

  if (!nodes.find(node => node.id === person)) {
    nodes.push({
      id: person,
      data: { label: person },
      position: { x: 0, y: 0 },
      style: {
        backgroundColor: nodeColor(0),
        borderRadius: '8px',
        boxShadow: '2px 2px 5px rgba(0, 0, 0, 0.2)',
        border: '1px solid #ccc',
        padding: '10px',
      },
    });
  }

  for (let i = 1; i <= stages; i++) {
    const nextChildren = [];
    for (const p of currentPersons) {
      if (tree[p.name]) {
        tree[p.name].forEach(child => {
          if (!visited.has(child)) {
            const childId = child;
            if (!nodes.find(node => node.id === childId)) {
              const yPos = i * 100;
              nodes.push({
                id: childId,
                data: { label: child },
                position: { x: 0, y: yPos },
                style: {
                  backgroundColor: nodeColor(i),
                  borderRadius: '8px',
                  boxShadow: '2px 2px 5px rgba(0, 0, 0, 0.2)',
                  border: '1px solid #ccc',
                  padding: '10px',
                },
              });
            }
            const edge = {
              id: `${p.name}-${child}`,
              source: p.name,
              target: childId,
              style: { stroke: '#888', strokeWidth: 2, markerEnd: { type: 'arrowclosed', orient: 'auto' } },
              animated: true,
            };
            edges.push(edge);
            nextChildren.push({ name: child, level: i, id: child });
            visited.add(child);
          }
        });
      }
    }
    if (nextChildren.length === 0) break;
    currentPersons = nextChildren;
  }
  return { nodes, edges };
};

function App() {
  const [personName, setPersonName] = useState('');
  const [upwardLevels, setUpwardLevels] = useState(2);
  const [downwardLevels, setDownwardLevels] = useState(2);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [familyTree, setFamilyTree] = useState({});
  const [error, setError] = useState('');
  const reactFlowRef = useRef(null);
  const [user, setUser] = useState(null); // Add user state

  const handlePersonNameChange = (event) => {
    setPersonName(event.target.value);
    setError('');
  };

  const handleUpwardLevelsChange = (event) => {
    setUpwardLevels(parseInt(event.target.value) || 0);
    setError('');
  };

  const handleDownwardLevelsChange = (event) => {
    setDownwardLevels(parseInt(event.target.value) || 0);
    setError('');
  };


  const generateReport = useCallback(() => {
    setError('');
    setNodes([]);
    setEdges([]);

    if (!personName.trim()) {
      setError('Please enter your name.');
      return;
    }

    if (isNaN(upwardLevels) || upwardLevels < 0) {
      setError('Upward Levels must be a non-negative number.');
      return;
    }

    if (isNaN(downwardLevels) || downwardLevels < 0) {
      setError('Downward Levels must be a non-negative number.');
      return;
    }

    if (!user) {
      setError('Please sign in to generate a report.');
      return;
    }

    if (!familyTree[personName]) {
      setError('The entered name is not found in the family data.');
      return;
    }

    const upwardData = generateUpwardHierarchyData(personName, upwardLevels, familyTree);
    const downwardData = generateDownwardHierarchyData(personName, downwardLevels, familyTree);

    const allNodes = [...upwardData.nodes, ...downwardData.nodes];
    const allEdges = [...upwardData.edges, ...downwardData.edges];
    const positionedNodes = positionNodes(allNodes);

    setNodes(positionedNodes);
    setEdges(allEdges);
  }, [personName, upwardLevels, downwardLevels, familyTree, setNodes, setEdges, user]);

  const clearReport = useCallback(() => {
    setPersonName('');
    setUpwardLevels(2);
    setDownwardLevels(2);
    setNodes([]);
    setEdges([]);
    setError('');
  }, [setNodes, setEdges]);

  const handleDownload = useCallback(() => {
    if (!reactFlowRef.current) {
      setError('No graph to download.');
      return;
    }

    const reactFlowElement = reactFlowRef.current;

    toPng(reactFlowElement, { backgroundColor: '#f7f7f7' })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'family_tree_report.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((err) => {
        setError(`Error downloading graph: ${err.message || 'Unknown error'}`);
        console.error('Error downloading graph:', err);
      });
  }, [setError]);

  useEffect(() => {
    // Check for existing login on component mount
    auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Get a reference to the user's document in Firestore
      const userRef = doc(db, 'users', user.uid);

      // Data to store
      const userData = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      };

      // Store the user data in Firestore
      await setDoc(userRef, userData, { merge: true }); // Use merge to avoid overwriting existing data

      setUser(user);
      setError(null);
      console.log("User Data", result.user);
    } catch (err) {
      setError(err.message);
      setUser(null);
      console.error("Error signing in", err);
    }
  };

    const handleSignOut = () => {
    signOut(auth).then(() => {
      setUser(null);
    }).catch(err => {
      setError(err.message);
      console.error("Error signing out", err)
    })
  }

  const CustomEdge = ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style,
    markerEnd,
  }) => {
    const [edgePath] = useState(getBezierPath({ sourceX, sourceY, targetX, targetY }));

    return (
      <path
        id={id}
        style={style}
        d={edgePath}
        markerEnd={markerEnd}
        className="react-flow__edge-path"
      />
    );
  };

  const handleCSVUpload = useCallback((parsedData) => {
    // This function now receives the CSV data directly
    console.log('CSV Data received in App.js:', parsedData);
    setFamilyTree(parsedData);
  }, []);

  return (
    <ReactFlowProvider>
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Family Hierarchy
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {user ? (
          <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6" gutterBottom>
              Welcome, {user.displayName}!
            </Typography>
            <Button variant="outlined" onClick={handleSignOut} sx={{ flexGrow: 1 }}>
              Sign Out
            </Button>
            <CSVUpload onCSVData={handleCSVUpload} />
            <Typography variant="h6" gutterBottom>
              Generate Report
            </Typography>
            <TextField
              fullWidth
              label="Your Name"
              id="personName"
              value={personName}
              onChange={handlePersonNameChange}
              error={!!error && error.includes('name')}
              helperText={!!error && error.includes('name') ? error : ''}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Upward Levels"
                type="number"
                id="upwardLevels"
                value={upwardLevels}
                onChange={handleUpwardLevelsChange}
                error={!!error && error.includes('Upward')}
                helperText={!!error && error.includes('Upward') ? error : ''}
                sx={{ flexGrow: 1 }}
              />
              <TextField
                label="Downward Levels"
                type="number"
                id="downwardLevels"
                value={downwardLevels}
                onChange={handleDownwardLevelsChange}
                error={!!error && error.includes('Downward')}
                helperText={!!error && error.includes('Downward') ? error : ''}
                sx={{ flexGrow: 1 }}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="contained" onClick={generateReport} sx={{ flexGrow: 1 }}>
                Generate Report
              </Button>
              <Button variant="outlined" onClick={clearReport} sx={{ flexGrow: 1 }}>
                Clear
              </Button>
              <Button
                variant="contained"
                onClick={handleDownload}
                sx={{ flexGrow: 1 }}
              >
                Download Report
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6" gutterBottom>
              Please Sign In
            </Typography>
            <Button onClick={handleGoogleSignIn}>Continue with Google</Button>
          </Box>
        )}

        <Box
          sx={{ height: 500, width: '100%', border: '1px solid #ccc', borderRadius: '5px', overflow: 'visible' }}
          ref={reactFlowRef}
        >
          {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              attributionPosition="top-right"
              edgeTypes={{
                custom: CustomEdge,
              }}
            >
              <Background color="#aaa" size={1} />
              <Controls />
            </ReactFlow>
          ) : (
            <Typography variant="body1" color="textSecondary" sx={{ p: 2 }}>
              No report generated yet. Enter your name and levels to see the family hierarchy.
            </Typography>
          )}
        </Box>
      </Container>
    </ReactFlowProvider>
  );
}

export default App;
