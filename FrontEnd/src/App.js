import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import './App.css';
import { Container, Row, Col, Card, Button, InputGroup, FormControl, Table, Spinner } from "react-bootstrap";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcase, faCode, faTrash, faFileCirclePlus, faCheck, faXmark, faPen, faQuestionCircle, faPause, faCheckDouble } from '@fortawesome/free-solid-svg-icons';
import ProjectDetails from "./components/ProjectDetails";
import Header from './components/Header';
import AddProjectModal from "./components/AddProjectModal";
import { PublicClientApplication } from "@azure/msal-browser"; // Import MSAL
import { authConfig, authConfigTuke, BASE_URL } from "./auth/authConfig"; // Import the named exports
import Login from "./auth/Login";
import JiraService from "./JiraService";

const msalInstance = new PublicClientApplication(authConfig); // Create a new MSAL instance for NXT
const msalInstanceTuke = new PublicClientApplication(authConfigTuke); // Create a new MSAL instance for TUKE

const statusOrder = ["new", "active", "hold", "end"]; // Define the status order

function App() {
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [accessTokenJira, setAccessTokenJira] = useState(null);
  const [cloudId, setCloudId] = useState(null);
  const [jiraProjects, setJiraProjects] = useState(null);
  const { fetchJira, fetchCloudId, fetchJiraProjects, fetchJiraIssues, filterIssues, addIssuesToProjects } = JiraService();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");
  const navigate = useNavigate();
  const [tukeLogin, setTukeLogin] = useState(false);

  const [newProjectId, setNewProjectId] = useState(null); // State to track the newly created project
  const projectListRef = useRef(null); // Ref for scrolling to the project list
  const [highlightActive, setHighlightActive] = useState(false); // State to track highlight status

  // State for selected category and status
  const [selectedStatuses, setSelectedStatuses] = useState(["new", "active"]); // Default selected statuses
  const [projectDetailsModalOpen, setProjectDetailsModalOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState(null);

  const [loading, setLoading] = useState(true);

  //-------JIRA
  useEffect(() => {
    if (!isLoggedIn) return;

    const expiration = localStorage.getItem('accessTokenJiraExpiration')
    if(!localStorage.getItem('accessTokenJira') || Date.now() > expiration){
      fetchJira()
         .then(response => {
           setAccessTokenJira(response.access_token);
           localStorage.setItem('accessTokenJira', response.access_token);
           localStorage.setItem('accessTokenJiraExpiration', Date.now() + response.expires_in *1000)
           window.location.href = BASE_URL;
         })
         .catch(error => {
           console.error('Failed to fetch Jira data:', error);
         });
    }
  },[isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return;

    fetchCloudId()
       .then(cloudData => {
         localStorage.setItem('cloudId', cloudData.id);
         setCloudId(cloudData.id);

         fetchJiraProjects().then(projects => {
           fetchJiraIssues().then(issues => {
             console.log(addIssuesToProjects(filterIssues(issues), projects));
             setJiraProjects(addIssuesToProjects(filterIssues(issues), projects));
           }).catch(e => {
             console.error(e);
           })
         }).catch(e => {
           console.error(e);
         })

       })
       .catch(error => {
         console.error('Failed to fetch Jira Cloud ID:', error);
       });
  },[accessTokenJira, isLoggedIn])

  // Initialize MSAL on component mount
  useEffect(() => {
    const initializeMSAL = async () => {
      try {
        await msalInstance.initialize(); // Initialize MSAL
        await msalInstanceTuke.initialize(); // Initialize MSAL

        // Check for existing login state
        const storedAccessToken = localStorage.getItem('accessToken');

        if (storedAccessToken) {
          setAccessToken(storedAccessToken);
          setIsLoggedIn(true);
          await refreshAccessToken(); // Refresh token if it's close to expiring
        } else {
          // If not logged in, prompt for login
          // await authenticateOneDrive();
        }
      } catch (error) {
        console.error("MSAL Initialization error:", error);
      }
    };

    initializeMSAL(); // Call the initialize function
  }, []);

  // Function to sort projects
  const sortProjects = (projects) => {
    return projects.sort((a, b) => {
      const statusA = statusOrder.indexOf(a.type.toLowerCase());
      const statusB = statusOrder.indexOf(b.type.toLowerCase());
      if (statusA !== statusB) return statusA - statusB; // Sort by status
      return a.name.localeCompare(b.name); // Sort by name
    });
  };

  // Function to authenticate user
  const authenticateOneDrive = async (tukeLogin) => {
    setTukeLogin(tukeLogin);
    if(tukeLogin) {
      try {
        const response = await msalInstance.loginPopup({
          scopes: ["Files.ReadWrite", "User.Read"], // Define the scopes you need
        });
        const tokenResponse = await msalInstance.acquireTokenSilent({
          scopes: ["Files.ReadWrite", "User.Read"],
          account: response.account,
        });
        setAccessToken(tokenResponse.accessToken);
        setIsLoggedIn(true);

        // Store the access token and user name in localStorage
        localStorage.setItem('accessToken', tokenResponse.accessToken);
        localStorage.setItem('userName', response.account.name);

        // Fetch user profile information
        await fetchUserProfile(tokenResponse.accessToken);
      } catch (error) {
        console.error("Authentication error:", error);
      }
    }else{
      try {
        const response = await msalInstanceTuke.loginPopup({
          scopes: ["Files.ReadWrite", "User.Read"], // Define the scopes you need
        });
        const tokenResponse = await msalInstanceTuke.acquireTokenSilent({
          scopes: ["Files.ReadWrite", "User.Read"],
          account: response.account,
        });
        setAccessToken(tokenResponse.accessToken);
        setIsLoggedIn(true);

        // Store the access token and user name in localStorage
        localStorage.setItem('accessToken', tokenResponse.accessToken);
        localStorage.setItem('userName', response.account.name);

        // Fetch user profile information
        await fetchUserProfile(tokenResponse.accessToken);
      } catch (error) {
        console.error("Authentication error:", error);
      }
    }
  };

  // Function to fetch user profile information
  const fetchUserProfile = async (token) => {
    try {
      const userProfileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (userProfileResponse.ok) {
        const userProfileData = await userProfileResponse.json();
        setUserName(userProfileData.displayName);
      } else {
        console.error("Failed to fetch user profile");
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  // Function to refresh the access token
  const refreshAccessToken = async () => {
    if(tukeLogin){
      try {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes: ["Files.ReadWrite", "User.Read"],
            account: accounts[0],
          });
          setAccessToken(tokenResponse.accessToken);
          localStorage.setItem('accessToken', tokenResponse.accessToken);
        }
      } catch (error) {
        console.error("Token refresh error:", error);
        // If refreshing the token fails, log the user out
        logout();
      }
    }else{
      try {
        const accounts = msalInstanceTuke.getAllAccounts();
        if (accounts.length > 0) {
          const tokenResponse = await msalInstanceTuke.acquireTokenSilent({
            scopes: ["Files.ReadWrite", "User.Read"],
            account: accounts[0],
          });
          setAccessToken(tokenResponse.accessToken);
          localStorage.setItem('accessToken', tokenResponse.accessToken);
        }
      } catch (error) {
        console.error("Token refresh error:", error);
        // If refreshing the token fails, log the user out
        logout();
      }
    }
  };

  // Function to log out the user
  const logout = () => {
    setAccessToken(null);
    setIsLoggedIn(false);
    setUserName("");
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userName');
  };

  // Fetching projects from the backend API
  useEffect(() => {
    const fetchProjects = async () => {
      if (!isLoggedIn) return; // Don't fetch projects if not logged in

      setLoading(true); // Start loading

      try {
        const response = await fetch(`${BASE_URL}/api/projects`, {
          method: 'GET',
          headers: {
            'accept': '*/*',
            Authorization: `Bearer ${accessToken}` // Include the access token in the request
          }
        });

        if (response.ok) {
          const projectList = await response.json();
          setProjects(sortProjects(projectList)); // Sort projects after fetching
        } else {
          throw new Error('Failed to fetch projects');
        }
      } catch (error) {
        console.error(error.message);
      }finally {
      setLoading(false); // End loading
      }
    };
    fetchProjects();
  }, [isLoggedIn, accessToken]); // Fetch projects when logged in status or access token changes


  // Function to refresh the project list
  const refreshProjects = async () => {
    if (!isLoggedIn) return; // Don't refresh if not logged in

    try {
      const response = await fetch(`${BASE_URL}/api/projects`, {
        method: 'GET',
        headers: {
          'accept': '*/*',
          Authorization: `Bearer ${accessToken}` // Include the access token in the request
        }
      });

      if (response.ok) {
        const projectList = await response.json();
        setProjects(sortProjects(projectList)); // Sort projects after fetching
      } else {
        throw new Error('Failed to fetch projects');
      }
    } catch (error) {
      console.error(error.message);
    }
  };

  const openProjectDetailsModal = (id) => {
    setCurrentProjectId(id);
    setProjectDetailsModalOpen(true);
    setHighlightActive(false); // Clear highlight when opening project details
  };

  // Deleting a project by ID
  const deleteProject = async (id) => {
    try {
      const response = await fetch(`${BASE_URL}/api/projects/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}` // Include the access token in the request
        }
      });

      if (response.ok) {
        setProjects(projects.filter(project => project.id !== id)); // Update projects state
      } else {
        throw new Error('Failed to delete project');
      }
    } catch (error) {
      console.error(error.message);
    }
  };

  // Function to open the modal
  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = async (newProjectStatus, newProjectId, shouldClose = true) => {
    setIsModalOpen(false);
    setProjectDetailsModalOpen(false);
    await refreshProjects();

    // Set the new project ID for highlighting
    setNewProjectId(newProjectId);
    setHighlightActive(true); // Activate the highlight

    // Ensure the new status is visible if not already selected
    if (typeof newProjectStatus !== "string") {
      return;
    }
    const statusLower = newProjectStatus.toLowerCase();

    if (!selectedStatuses.includes(statusLower)) {
      setSelectedStatuses(prevStatuses => [...prevStatuses, statusLower]);
    }

    if (shouldClose) {
        setTimeout(() => {
            document.body.classList.remove("modal-open");
        }, 250);
    }
  };

  useEffect(() => {
    if (newProjectId) {
      const projectElement = document.getElementById(`project-${newProjectId}`);
      if (projectElement) {
        projectElement.scrollIntoView({ behavior: "smooth", block: "center" }); // Scroll to the new project
      }
    }
  }, [newProjectId]);

  // Function to toggle status selection
  const toggleStatus = (status) => {
    setSelectedStatuses(prevStatuses => {
      if (prevStatuses.includes(status)) {
        return prevStatuses.filter(s => s !== status);
      } else {
        return [...prevStatuses, status];
      }
    });
  };

  // Filtered projects based on search term and selected statuses
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name && project.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatuses.includes(project.type.toLowerCase());
    return matchesSearch && matchesStatus;
  });

  // Function to generate the header text based on selected statuses
  const getHeaderText = () => {
    return `Projects - ${selectedStatuses.map(status => status.charAt(0).toUpperCase() + status.slice(1)).join(", ")}`;
  };

  const truncateDescription = (description, maxLength) => {
    if (description.length <= maxLength) {
      return description;
    }
    return description.slice(0, maxLength) + '...';
  };

  return (

    <div>
      {isLoggedIn ? (
        <>
          {/* Header */}
          <Header onLogin={authenticateOneDrive} onLogout={logout} userName={isLoggedIn ? userName : null} />

          {/* Browse Projects Block */}
          <Container fluid className="my-4">
            {/* Browse Projects Header */}
            <Row className="mb-3">
              <Col>
                <h2>Browse projects</h2>
                <hr />
              </Col>
            </Row>

            <Row>
              {/* Left Sidebar (Statuses) */}
              <Col xs={12} md={3} style={{ maxWidth: "250px" }} className="pe-3">
                <Card>
                  <Card.Body>

                    <div className="filterWrapper">
                      <h4>Statuses</h4>
                      <ul className="filterUl">
                        <li className="filterIl">
                          <a
                            href="#"
                            onClick={() => toggleStatus("active")}
                            className={selectedStatuses.includes("active") ? "active" : ""}
                          >
                            <FontAwesomeIcon icon={faCheck} /> Active
                          </a>
                        </li>
                        <li className="filterIl">
                          <a
                            href="#"
                            onClick={() => toggleStatus("new")}
                            className={selectedStatuses.includes("new") ? "active" : ""}
                          >
                            <FontAwesomeIcon icon={faPen} /> New
                          </a>
                        </li>
                        <li className="filterIl">
                          <a
                            href="#"
                            onClick={() => toggleStatus("hold")}
                            className={selectedStatuses.includes("hold") ? "active" : ""}
                          >
                            <FontAwesomeIcon icon={faPause} /> Hold
                          </a>
                        </li>
                        <li className="filterIl">
                          <a
                            href="#"
                            onClick={() => toggleStatus("end")}
                            className={selectedStatuses.includes("end") ? "active" : ""}
                          >
                            <FontAwesomeIcon icon={faXmark} /> End
                          </a>
                        </li>
                      </ul>
                    </div>
                  </Card.Body>
                </Card>
              </Col>

              {/* Main Content (Projects, Filter Input, and Table) */}
              <Col xs={12} md={10} className="position-relative" style={{ maxWidth: "85%", marginLeft: 0, paddingLeft: 0}}>
                {/* Header for Filter and Filter Field */}
                <Row className="align-items-center mb-3">
                  <Col>
                    <h3>{getHeaderText()}</h3>
                  </Col>
                  <Col md="auto">
                    <InputGroup>
                      <Button
                        onClick={openModal}
                        variant="primary"
                        className="rounded-pill me-2"
                      >
                        <FontAwesomeIcon icon={faFileCirclePlus} className="me-2" />
                        Add Project
                      </Button>
                      <FormControl
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search projects..."
                        style={{ width: "500px" }}
                      />
                    </InputGroup>
                  </Col>
                </Row>

                {/* Scrollable Table */}
                {loading ? (
                  <div className="d-flex justify-content-center align-items-center" style={{ height: "400px" }}>
                    <Spinner animation="border" variant="primary" />
                  </div>
                ) : (
                  <div ref={projectListRef} className="project-table-container" style={{ maxWidth: "100%", margin: "0 auto", overflowY: "auto", overflowX: "auto", position: "relative", marginBottom: "20px" }}>
                    <Table responsive striped bordered hover className="w-100" style = {{minHeight: "100%"}}>
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Issues</th>
                          <th>Status</th>
                          <th>Project Lead</th>
                          <th>URL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProjects.map((project) => (
                          <tr
                            key={project.id}
                            id={`project-${project.id}`}
                            className={highlightActive && newProjectId === project.id ? 'table-info' : ''}
                          >
                            <td>
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  openProjectDetailsModal(project.id);
                                }}
                              >
                                {project.name}
                              </a>
                              {project.description && (
                                <span className="project-description">
                                  {truncateDescription(project.description, 200)} {/* Limit to 100 characters */}
                                </span>
                              )}
                            </td>
                            <td>
                              {jiraProjects?.filter(proj => proj.id === project.jiraProjectId).length > 0
                                 ? jiraProjects.find(proj => proj.id === project.jiraProjectId)?.issues?.length || 'NaN'
                                 : 'NaN'}
                            </td>
                            <td>
                              {project.type.toLowerCase() === "active" && <FontAwesomeIcon icon={faCheck} />}
                              {project.type.toLowerCase() === "new" && <FontAwesomeIcon icon={faPen} />}
                              {project.type.toLowerCase() === "hold" && <FontAwesomeIcon icon={faPause} />}
                              {project.type.toLowerCase() === "end" && <FontAwesomeIcon icon={faXmark} />}
                            </td>
                            <td>{project.lead}</td>
                            <td>{project.url || "No URL"}</td>
                            <td>
                              <FontAwesomeIcon
                                icon={faTrash}
                                onClick={() => deleteProject(project.id)}
                                style={{ cursor: "pointer", color: "red"}}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
              </Col>
            </Row>
          </Container>

          {/* Add Project Modal */}
          <AddProjectModal isOpen={isModalOpen} onClose={(newProjectStatus, newProjectId) => closeModal(newProjectStatus, newProjectId)} />

          {/* Project Details Modal */}
          {projectDetailsModalOpen && (
            <ProjectDetails
              projectId={currentProjectId}
              onClose={closeModal}
              accessToken={accessToken}
              jiraProjects={jiraProjects}
            />
          )}
        </>
      ) : (
        // If not logged in, do not render anything (login prompt will be handled in useEffect)
        //null
        <Login onLogin={authenticateOneDrive} />
      )}
    </div>
  );
}

export default App;