// import React, { useState } from 'react';
// import { Button, TextField, Box, Alert, Typography } from '@mui/material';
// import { getFirestore, collection, setDoc, doc } from 'firebase/firestore';
// import { useAuth } from '../contexts/AuthContext';

// function CSVUpload() {
//     const [csvFile, setCsvFile] = useState(null);
//     const [uploadError, setUploadError] = useState('');
//     const [uploadSuccess, setUploadSuccess] = useState(false);
//     const { currentUser } = useAuth(); // Get the logged-in user

//     const handleFileChange = (event) => {
//       const file = event.target.files?.[0];
//       if (file && file.type === 'text/csv') {
//           setCsvFile(file);
//           setUploadError('');
//           setUploadSuccess(false);
//       } else if (file) {
//           setCsvFile(null);
//           setUploadError('Please upload a valid CSV file.');
//           setUploadSuccess(false);
//       } else {
//           setCsvFile(null);
//       }
//     };

//     const handleUpload = async () => {
//         if (!csvFile) {
//             setUploadError('Please select a CSV file to upload.');
//             return;
//         }

//         if (!currentUser) {
//             setUploadError('You must be logged in to upload data.');
//             return;
//         }

//         try {
//             const reader = new FileReader();

//             reader.onload = async (e) => {
//                 const csvData = e.target?.result;
//                 if (typeof csvData === 'string') {
//                     const parsedData = parseCSV(csvData);

//                     const db = getFirestore();
//                     const familyDataCollection = collection(db, 'familyData');

//                     await setDoc(doc(familyDataCollection, currentUser.uid), {
//                         uploaderId: currentUser.uid,
//                         data: parsedData,
//                         timestamp: new Date(),
//                     }, { merge: true });

//                     setUploadSuccess(true);
//                     setUploadError('');
//                     setCsvFile(null);
//                 } else {
//                     setUploadError('Error reading file content. Expected string.');
//                 }
//             };

//             reader.onerror = () => {
//                 setUploadError('Error reading the CSV file.');
//             };

//             reader.readAsText(csvFile);
//         } catch (error) {
//             console.error('Error uploading CSV:', error);
//             setUploadError('Failed to upload CSV data.');
//         }
//     };

//     const parseCSV = (csvText) => {
//         if (!csvText) {
//             return {};
//         }
//         const lines = csvText.trim().split('\n');
//         const header = lines[0].split(',').map(h => h.trim());
//         if (header[0] !== 'Parent' || header[1] !== 'Children') {
//             throw new Error('Invalid CSV header. Expected "Parent,Children"');
//         }
//         const data = {};
//         for (let i = 1; i < lines.length; i++) {
//             const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
//             const parent = values[0];
//             const children = values.slice(1).filter(Boolean);
//             data[parent] = children;
//         }
//         return data;
//     };

//     return (
//         <Box sx={{ mt: 3 }}>
//             <Typography variant="h6" gutterBottom>
//                 Upload Family Data (CSV)
//             </Typography>

//             <Typography variant="body2" gutterBottom>
//                 <strong>CSV Format Instructions:</strong>
//             </Typography>
//             <Typography variant="body2" gutterBottom>
//                 The CSV file should have two columns: "Parent" and "Children".  The first row
//                 should be the header row.  Subsequent rows should list the parent and their
//                 children, separated by commas.  For example:
//             </Typography>
//             <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: '8px 0' }}>
//                 Parent,Children(These are the headers in the CSV file)<br/>  
//                 Parentname,Child1,Child2,Child3,...(2nd row Parent-Childern values)<br/>
//             </pre>

//             <TextField
//                 type="file"
//                 accept=".csv"
//                 onChange={handleFileChange}
//                 fullWidth
//                 inputProps={{ 'aria-label': 'upload csv file' }}
//                 sx={{ mt: 2 }}
//             />
//             {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}
//             {uploadSuccess && <Alert severity="success" sx={{ mt: 2 }}>Family data uploaded successfully!</Alert>}
//             <Button
//                 variant="contained"
//                 color="primary"
//                 onClick={handleUpload}
//                 disabled={!csvFile || !currentUser}
//                 sx={{ mt: 2 }}
//             >
//                 Upload
//             </Button>
//             {!currentUser && (
//                 <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
//                     Please sign in to upload data.
//                 </Typography>
//             )}
//         </Box>
//     );
// }

// export default CSVUpload;


import React, { useState, useCallback } from 'react';
import { Button, TextField, Box, Alert, Typography } from '@mui/material';
import { getFirestore, collection, doc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { parse } from 'papaparse'; // Import papaparse
import { initializeApp } from 'firebase/app';
import firebaseConfig from '../firebaseConfig';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function CSVUpload({ onCSVData }) {
    const [csvFile, setCsvFile] = useState(null);
    const [uploadError, setUploadError] = useState('');
    const [uploadSuccess, setUploadSuccess] = useState(false);
    const [currentUser] = useState(auth.currentUser);

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (file && file.type === 'text/csv') {
            setCsvFile(file);
            setUploadError('');
            setUploadSuccess(false);
        } else if (file) {
            setCsvFile(null);
            setUploadError('Please upload a valid CSV file.');
            setUploadSuccess(false);
        } else {
            setCsvFile(null);
        }
    };

    const parseCSV = useCallback((csvText) => {
        if (!csvText) {
            return {};
        }
        try {
            const parsedData = parse(csvText, { header: true, skipEmptyLines: true }).data;  // Use the imported parse
            const tree = {};

            parsedData.forEach(row => {
                const parent = row['Parent'];
                const children = row['Children'] ? row['Children'].split(',').map(child => child.trim()) : [];

                if (parent) {
                    tree[parent] = children;
                }
            });
            return tree;
        } catch (error) {
            console.error("Error parsing CSV:", error);
            setUploadError("Error parsing CSV file.  Please check the format.");
            return {}; // Important: Return an empty object on error to prevent further issues
        }
    }, []);

    const handleUpload = async () => {
        if (!csvFile) {
            setUploadError('Please select a CSV file to upload.');
            return;
        }

        if (!currentUser) {
            setUploadError('You must be logged in to upload data.');
            return;
        }

        try {
            const reader = new FileReader();

            reader.onload = async (e) => {
                const csvData = e.target?.result;
                if (typeof csvData === 'string') {
                    const parsedData = parseCSV(csvData);

                    if (Object.keys(parsedData).length === 0 && !uploadError) {
                      setUploadError("No data found in CSV or error during parsing.");
                      return;
                    }

                    try {
                        const fileId = `familyData_${Date.now()}`;
                        console.log(fileId);
                        const fileRef = doc(collection(db, 'familyData'), fileId);
                        await setDoc(fileRef, {
                            csvData: csvData,
                            uploaderId: currentUser.uid,
                        }, { merge: true });

                        onCSVData(parsedData);
                        setUploadSuccess(true);
                        setUploadError('');
                        setCsvFile(null);

                    } catch (e) {
                        setUploadError('Failed to upload data to firestore.');
                        console.error("Firestore error", e);
                    }


                } else {
                    setUploadError('Error reading file content. Expected string.');
                }
            };

            reader.onerror = () => {
                setUploadError('Error reading the CSV file.');
            };

            reader.readAsText(csvFile);
        } catch (error) {
            console.error('Error uploading CSV:', error);
            setUploadError('Failed to upload CSV data.');
        }
    };



    return (
        <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
                Upload Family Data (CSV)
            </Typography>

            <Typography variant="body2" gutterBottom>
                <strong>CSV Format Instructions:</strong>
            </Typography>
            <Typography variant="body2" gutterBottom>
                The CSV file should have two columns: "Parent" and "Children".  The first row
                should be the header row.  Subsequent rows should list the parent and their
                children, separated by commas.  For example:
            </Typography>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: '8px 0' }}>
                Parent,Children<br/>
                Parshottambhai,Batukbhai,Meghajibhai,Velajibhai,Premjibhai<br/>
                Jagdishbhai,Meet,Kruti<br/>
                Niteenbhai,Het,Heli
            </pre>

            <TextField
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                fullWidth
                inputProps={{ 'aria-label': 'upload csv file' }}
                sx={{ mt: 2 }}
            />
            {uploadError && <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>}
            {uploadSuccess && <Alert severity="success" sx={{ mt: 2 }}>Family data uploaded successfully!</Alert>}
            <Button
                variant="contained"
                color="primary"
                onClick={handleUpload}
                disabled={!csvFile || !currentUser}
                sx={{ mt: 2 }}
            >
                Upload
            </Button>
            {!currentUser && (
                <Typography variant="caption" color="textSecondary" sx={{ mt: 1 }}>
                    Please sign in to upload data.
                </Typography>
            )}
        </Box>
    );
}

export default CSVUpload;

