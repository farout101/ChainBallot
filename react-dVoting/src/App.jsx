import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Web3 from 'web3'
import VotingArtifact from '../../truffle-dVoting/build/contracts/Voting.json'
import './App.css'

const GANACHE_NETWORK_IDS = [5777, 1337]
const FALLBACK_CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || ''

function getDeployedAddress() {
  const networks = VotingArtifact.networks || {}
  return (
    networks[GANACHE_NETWORK_IDS[0]]?.address ||
    networks[String(GANACHE_NETWORK_IDS[0])]?.address ||
    FALLBACK_CONTRACT_ADDRESS
  )
}

const formatAddress = (value) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '—'

const toNumberSafe = (value) => {
  if (value === null || value === undefined) {
    return null
  }
  const asString =
    typeof value === 'bigint'
      ? value.toString()
      : typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? String(value)
          : value?.toString?.()

  if (!asString) {
    return null
  }

  const parsed = Number.parseInt(asString, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function App() {
  const [web3, setWeb3] = useState(null)
  const [contract, setContract] = useState(null)
  const [account, setAccount] = useState('')
  const [networkId, setNetworkId] = useState(null)
  const [owner, setOwner] = useState('')
  const [electionActive, setElectionActive] = useState(false)
  const [electionStart, setElectionStart] = useState(null)
  const [electionEnd, setElectionEnd] = useState(null)
  const [isWhitelisted, setIsWhitelisted] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [votedCandidateIndex, setVotedCandidateIndex] = useState(null)
  const [votedAt, setVotedAt] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [selectedCandidate, setSelectedCandidate] = useState('')
  const [whitelistAddress, setWhitelistAddress] = useState('')
  const [whitelistBatch, setWhitelistBatch] = useState('')
  const [newCandidateName, setNewCandidateName] = useState('')
  const [removeCandidateId, setRemoveCandidateId] = useState('')
  const [winner, setWinner] = useState(null)
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const deployedAddress = useMemo(() => getDeployedAddress(), [])

  const loadEvents = async (activeContract) => {
    if (!activeContract) {
      return
    }

    try {
      const pastEvents = await activeContract.getPastEvents('allEvents', {
        fromBlock: 0,
        toBlock: 'latest',
      })

      const formatted = pastEvents
        .map((event) => {
          const id = `${event.transactionHash}-${event.logIndex}`
          const summary = (() => {
            switch (event.event) {
              case 'Whitelisted':
                return `Whitelisted ${formatAddress(event.returnValues.voter)}`
              case 'CandidateAdded':
                return `Candidate added: ${event.returnValues.name}`
              case 'CandidateRemoved':
                return `Candidate removed #${event.returnValues.candidateIndex}`
              case 'ElectionStarted':
                return 'Election started'
              case 'ElectionEnded':
                return 'Election ended'
              case 'VoteCast':
                return `Vote cast: #${event.returnValues.candidateIndex}`
              default:
                return event.event || 'Event'
            }
          })()

          return {
            id,
            name: event.event || 'Event',
            summary,
            blockNumber: toNumberSafe(event.blockNumber) ?? 0,
            txHash: event.transactionHash,
          }
        })
        .sort((a, b) => b.blockNumber - a.blockNumber)
        .slice(0, 20)

      setEvents(formatted)
    } catch (eventError) {
      setError(eventError?.message || 'Failed to load events.')
    }
  }

  const loadContractState = async (activeContract, activeAccount) => {
    const [contractOwner, activeFlag, startTime, endTime] = await Promise.all([
      activeContract.methods.owner().call(),
      activeContract.methods.electionActive().call(),
      activeContract.methods.electionStart().call(),
      activeContract.methods.electionEnd().call(),
    ])

    const count =
      toNumberSafe(await activeContract.methods.candidateCount().call()) ?? 0
    const loadedCandidates = []

    for (let i = 0; i < count; i += 1) {
      const candidateInfo = await activeContract.methods.candidateInfo(i).call()
      loadedCandidates.push({
        index: i,
        name: candidateInfo.name,
        votes: toNumberSafe(candidateInfo.votes) ?? 0,
        active: candidateInfo.active,
      })
    }

    let whitelistFlag = false
    let votedFlag = false
    let candidateIndex = null
    let voteTimestamp = null

    if (activeAccount) {
      const statusInfo = await activeContract.methods
        .voterStatus(activeAccount)
        .call()
      whitelistFlag = statusInfo[0]
      votedFlag = statusInfo[1]
      candidateIndex = votedFlag ? toNumberSafe(statusInfo[2]) : null
      voteTimestamp = votedFlag ? toNumberSafe(statusInfo[3]) : null
    }

    const winnerInfo = await activeContract.methods.getWinner().call()

    setOwner(contractOwner)
    setElectionActive(Boolean(activeFlag))
    setElectionStart(toNumberSafe(startTime) || null)
    setElectionEnd(toNumberSafe(endTime) || null)
    setIsWhitelisted(Boolean(whitelistFlag))
    setHasVoted(Boolean(votedFlag))
    setVotedCandidateIndex(candidateIndex)
    setVotedAt(voteTimestamp)
    setCandidates(loadedCandidates)
    setWinner({
      index: toNumberSafe(winnerInfo[0]) ?? 0,
      name: winnerInfo[1],
      votes: toNumberSafe(winnerInfo[2]) ?? 0,
      hasTie: Boolean(winnerInfo[3]),
      hasWinner: Boolean(winnerInfo[4]),
    })

    if (loadedCandidates.length > 0 && selectedCandidate === '') {
      const firstActive = loadedCandidates.find((item) => item.active)
      if (firstActive) {
        setSelectedCandidate(String(firstActive.index))
      }
    }
  }

  const initWeb3 = async (requested = false) => {
    if (!window.ethereum) {
      setError('No Ethereum provider found. Install MetaMask or use Ganache.')
      return
    }

    try {
      setError('')
      if (requested) {
        await window.ethereum.request({ method: 'eth_requestAccounts' })
      }

      const instance = new Web3(window.ethereum)
      const [activeAccount] = await instance.eth.getAccounts()
      const activeNetworkId = await instance.eth.net.getId()
      const contractInstance = new instance.eth.Contract(
        VotingArtifact.abi,
        deployedAddress,
      )

      setWeb3(instance)
      setAccount(activeAccount || '')
      setNetworkId(activeNetworkId)
      setContract(contractInstance)

      if (activeAccount) {
        await loadContractState(contractInstance, activeAccount)
      }
      await loadEvents(contractInstance)
    } catch (initError) {
      setError(initError?.message || 'Failed to connect wallet.')
    }
  }

  useEffect(() => {
    initWeb3(false)

    if (!window.ethereum) {
      return undefined
    }

    const handleAccountsChanged = async (accounts) => {
      const nextAccount = accounts?.[0] || ''
      setAccount(nextAccount)
      if (contract) {
        await loadContractState(contract, nextAccount)
      }
    }

    const handleChainChanged = () => initWeb3(false)

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [deployedAddress, contract])

  const handleConnect = async () => {
    await initWeb3(true)
  }

  const handleReconnect = async () => {
    if (!window.ethereum) {
      setError('No Ethereum provider found. Install MetaMask or use Ganache.')
      return
    }

    try {
      setError('')
      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      })
      await initWeb3(true)
    } catch (permissionError) {
      setError(permissionError?.message || 'Failed to reconnect wallet.')
    }
  }

  const refresh = async () => {
    if (!contract) {
      return
    }
    await loadContractState(contract, account)
    await loadEvents(contract)
  }

  const handleWhitelist = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    if (!whitelistAddress) {
      setError('Enter an address to whitelist.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Whitelisting address...')

    try {
      await contract.methods.whitelist(whitelistAddress).send({ from: account })
      setWhitelistAddress('')
      setStatus('Address whitelisted.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Whitelist transaction failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleWhitelistBatch = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    const addresses = whitelistBatch
      .split(/\s|,|;/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (addresses.length === 0) {
      setError('Paste at least one address.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Whitelisting batch...')

    try {
      await contract.methods.whitelistBatch(addresses).send({ from: account })
      setWhitelistBatch('')
      setStatus('Batch whitelist complete.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Batch whitelist failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleAddCandidate = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    if (!newCandidateName.trim()) {
      setError('Enter a candidate name.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Adding candidate...')

    try {
      await contract.methods
        .addCandidate(newCandidateName.trim())
        .send({ from: account })
      setNewCandidateName('')
      setStatus('Candidate added.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Add candidate failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveCandidate = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    if (removeCandidateId === '') {
      setError('Select a candidate to remove.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Removing candidate...')

    try {
      await contract.methods
        .removeCandidate(toNumberSafe(removeCandidateId))
        .send({ from: account })
      setRemoveCandidateId('')
      setStatus('Candidate removed.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Remove candidate failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleStartElection = async () => {
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }
    setBusy(true)
    setError('')
    setStatus('Starting election...')
    try {
      await contract.methods.startElection().send({ from: account })
      setStatus('Election started.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Start election failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleEndElection = async () => {
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }
    setBusy(true)
    setError('')
    setStatus('Ending election...')
    try {
      await contract.methods.endElection().send({ from: account })
      setStatus('Election ended.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'End election failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleVote = async () => {
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    if (selectedCandidate === '') {
      setError('Pick a candidate before voting.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Submitting your vote...')

    try {
      await contract.methods
        .vote(toNumberSafe(selectedCandidate))
        .send({ from: account })
      setStatus('Vote submitted.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Vote transaction failed.')
    } finally {
      setBusy(false)
    }
  }

  const isOwner =
    owner && account && owner.toLowerCase() === account.toLowerCase()

  const activeCandidates = candidates.filter((candidate) => candidate.active)
  const votedCandidateName =
    votedCandidateIndex !== null
      ? candidates.find((item) => item.index === votedCandidateIndex)?.name ||
        `#${votedCandidateIndex}`
      : ''

  const networkWarning =
    networkId && !GANACHE_NETWORK_IDS.includes(toNumberSafe(networkId))
      ? `Wrong network. Switch to Ganache (network id ${GANACHE_NETWORK_IDS.join(
          ' or ',
        )}).`
      : ''

  const electionLabel = electionActive ? 'Active' : 'Inactive'
  const electionBadge = electionActive ? 'badge-success' : 'badge-muted'

  const adminPage = (
    <section className="card-panel h-100">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="section-title mb-0">Admin Console</h2>
        <div className="d-flex gap-2">
          <button
            className="btn btn-dark"
            onClick={handleStartElection}
            disabled={busy || !isOwner || electionActive}
          >
            Start
          </button>
          <button
            className="btn btn-outline-dark"
            onClick={handleEndElection}
            disabled={busy || !isOwner || !electionActive}
          >
            End
          </button>
        </div>
      </div>

      {!isOwner && (
        <p className="text-muted mb-4">
          Only the contract owner can manage the election.
        </p>
      )}

      <div className="admin-grid">
        <form onSubmit={handleWhitelist} className="d-grid gap-2">
          <label className="form-label">Whitelist Single Voter</label>
          <input
            className="form-control"
            placeholder="0x..."
            value={whitelistAddress}
            onChange={(event) => setWhitelistAddress(event.target.value)}
            disabled={!isOwner}
          />
          <button className="btn btn-dark" type="submit" disabled={busy || !isOwner}>
            Add Address
          </button>
        </form>

        <form onSubmit={handleWhitelistBatch} className="d-grid gap-2">
          <label className="form-label">Whitelist Batch</label>
          <textarea
            className="form-control"
            rows="4"
            placeholder="Paste addresses separated by space or comma"
            value={whitelistBatch}
            onChange={(event) => setWhitelistBatch(event.target.value)}
            disabled={!isOwner}
          />
          <button className="btn btn-outline-dark" type="submit" disabled={busy || !isOwner}>
            Import Batch
          </button>
        </form>

        <form onSubmit={handleAddCandidate} className="d-grid gap-2">
          <label className="form-label">Add Candidate</label>
          <input
            className="form-control"
            placeholder="Candidate name"
            value={newCandidateName}
            onChange={(event) => setNewCandidateName(event.target.value)}
            disabled={!isOwner}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !isOwner}>
            Add Candidate
          </button>
        </form>

        <form onSubmit={handleRemoveCandidate} className="d-grid gap-2">
          <label className="form-label">Remove Candidate</label>
          <select
            className="form-select"
            value={removeCandidateId}
            onChange={(event) => setRemoveCandidateId(event.target.value)}
            disabled={!isOwner}
          >
            <option value="">Select candidate</option>
            {activeCandidates.map((candidate) => (
              <option key={`remove-${candidate.index}`} value={candidate.index}>
                {candidate.name}
              </option>
            ))}
          </select>
          <button className="btn btn-outline-danger" type="submit" disabled={busy || !isOwner}>
            Remove Candidate
          </button>
        </form>
      </div>
    </section>
  )

  const votePage = (
    <section className="card-panel h-100">
      <h2 className="section-title">Cast Your Vote</h2>
      <div className="d-grid gap-3">
        <div>
          <label className="form-label">Candidate</label>
          <select
            className="form-select"
            value={selectedCandidate}
            onChange={(event) => setSelectedCandidate(event.target.value)}
            disabled={activeCandidates.length === 0}
          >
            {activeCandidates.map((candidate) => (
              <option key={`vote-${candidate.index}`} value={candidate.index}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleVote}
          disabled={
            busy ||
            !isWhitelisted ||
            hasVoted ||
            !electionActive ||
            activeCandidates.length === 0
          }
        >
          {hasVoted ? 'Vote Recorded' : 'Submit Vote'}
        </button>
        {!electionActive && (
          <div className="text-muted small">
            Election is not active. Ask admin to start it.
          </div>
        )}
        {!isWhitelisted && account && (
          <div className="text-muted small">
            You must be whitelisted before voting.
          </div>
        )}
        {hasVoted && votedAt && (
          <div className="text-muted small">
            Voted at {new Date(votedAt * 1000).toLocaleString()}.
          </div>
        )}
      </div>
    </section>
  )

  const resultsPage = (
    <div className="row g-4">
      <div className="col-lg-7">
        <section className="card-panel h-100">
          <h2 className="section-title">Results</h2>
          {winner?.hasWinner && (
            <div className="winner-banner">
              <div>
                <div className="winner-label">Leading Candidate</div>
                <div className="winner-name">{winner.name}</div>
              </div>
              <div className="winner-votes">{winner.votes} votes</div>
              {winner.hasTie && (
                <span className="badge-pill badge-warning">Tie</span>
              )}
            </div>
          )}
          <div className="table-responsive">
            <table className="table table-striped align-middle">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Status</th>
                  <th className="text-end">Votes</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={`result-${candidate.index}`}>
                    <td>{candidate.name}</td>
                    <td>
                      {candidate.active ? (
                        <span className="badge-pill badge-success">Active</span>
                      ) : (
                        <span className="badge-pill badge-muted">Removed</span>
                      )}
                    </td>
                    <td className="text-end">{candidate.votes}</td>
                  </tr>
                ))}
                {candidates.length === 0 && (
                  <tr>
                    <td colSpan="3" className="text-center text-muted">
                      No candidates loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="col-lg-5">
        <section className="card-panel h-100">
          <h2 className="section-title">Activity Log</h2>
          <div className="log-list">
            {events.map((event) => (
              <div key={event.id} className="log-item">
                <div className="log-title">{event.summary}</div>
                <div className="log-meta">
                  Block {event.blockNumber} • {formatAddress(event.txHash)}
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-muted">No events yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )

  return (
    <div className="app-shell">
      <header className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-3">
            <h1 className="app-title">ChainBallot</h1>
            <span className={`badge-pill ${electionBadge}`}>{electionLabel}</span>
          </div>
          <p className="app-subtitle">
            Full election console: admin controls, live results, and activity feed.
          </p>
        </div>
        <div className="d-flex flex-column align-items-start align-items-lg-end gap-2">
          <div className="d-flex gap-2">
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={busy}
            >
              {account ? 'Wallet Connected' : 'Connect Wallet'}
            </button>
            <button
              className="btn btn-outline-primary"
              onClick={handleReconnect}
              disabled={busy}
            >
              Reconnect
            </button>
            <button className="btn btn-outline-dark" onClick={refresh} disabled={busy}>
              Refresh
            </button>
          </div>
          <div className="small text-muted">
            {account ? `Account: ${account}` : 'No account connected'}
          </div>
        </div>
      </header>

      {error && <div className="alert alert-danger">{error}</div>}
      {status && <div className="alert alert-success">{status}</div>}
      {networkWarning && <div className="alert alert-warning">{networkWarning}</div>}

      <section className="card-panel mb-4">
        <h2 className="section-title">Election Status</h2>
        <div className="row g-3">
          <div className="col-md-3">
            <div className="stat-card">
              <span className="stat-label">Contract</span>
              <span className="stat-value text-truncate">{deployedAddress}</span>
            </div>
          </div>
          <div className="col-md-3">
            <div className="stat-card">
              <span className="stat-label">Owner</span>
              <span className="stat-value text-truncate">{owner || '—'}</span>
            </div>
          </div>
          <div className="col-md-3">
            <div className="stat-card">
              <span className="stat-label">Election Window</span>
              <span className="stat-value">
                {electionStart ? new Date(electionStart * 1000).toLocaleString() : '—'}
              </span>
              <span className="stat-helper">
                {electionEnd
                  ? `Ended: ${new Date(electionEnd * 1000).toLocaleString()}`
                  : 'No end time yet'}
              </span>
            </div>
          </div>
          <div className="col-md-3">
            <div className="stat-card">
              <span className="stat-label">Your Status</span>
              <span className="stat-value">
                {account
                  ? `${isWhitelisted ? 'Whitelisted' : 'Not whitelisted'}${
                      hasVoted ? ' • Voted' : ''
                    }`
                  : 'Connect wallet'}
              </span>
              {hasVoted && (
                <span className="stat-helper">
                  Voted for {votedCandidateName}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <nav className="app-nav">
        <NavLink
          to="/vote"
          className={({ isActive }) =>
            `nav-link-item${isActive ? ' active' : ''}`
          }
        >
          Vote
        </NavLink>
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `nav-link-item${isActive ? ' active' : ''}`
          }
        >
          Admin
        </NavLink>
        <NavLink
          to="/results"
          className={({ isActive }) =>
            `nav-link-item${isActive ? ' active' : ''}`
          }
        >
          Results
        </NavLink>
      </nav>

      <div className="page-shell">
        <Routes>
          <Route path="/" element={<Navigate to="/vote" replace />} />
          <Route path="/vote" element={votePage} />
          <Route path="/admin" element={adminPage} />
          <Route path="/results" element={resultsPage} />
        </Routes>
      </div>
    </div>
  )
}

export default App