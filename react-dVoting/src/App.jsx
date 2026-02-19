import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Web3 from 'web3'
import VotingArtifact from '../../truffle-dVoting/build/contracts/Voting.json'
import './App.css'

const GANACHE_NETWORK_IDS = [5777, 1337]
const FALLBACK_CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS || ''

function getDeployedAddress() {
  const networks = VotingArtifact.networks || {}
  const knownIds = GANACHE_NETWORK_IDS.map((id) => String(id))
  const matchingKey = Object.keys(networks).find((key) =>
    knownIds.includes(String(key)),
  )
  return (
    (matchingKey ? networks[matchingKey]?.address : '') ||
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
  const [pollTitle, setPollTitle] = useState('')
  const [pollTitleInput, setPollTitleInput] = useState('')
  const [electionActive, setElectionActive] = useState(false)
  const [electionStart, setElectionStart] = useState(null)
  const [electionEnd, setElectionEnd] = useState(null)
  const [choices, setChoices] = useState([])
  const [whitelist, setWhitelist] = useState([])
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState('')
  const [choicesInput, setChoicesInput] = useState('')
  const [whitelistInput, setWhitelistInput] = useState('')
  const [removeWhitelistAddress, setRemoveWhitelistAddress] = useState('')
  const [isWhitelisted, setIsWhitelisted] = useState(false)
  const [hasVoted, setHasVoted] = useState(false)
  const [votedChoiceIndex, setVotedChoiceIndex] = useState(null)
  const [votedAt, setVotedAt] = useState(null)
  const [winner, setWinner] = useState(null)
  const [events, setEvents] = useState([])
  const [eventWarning, setEventWarning] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const contractRef = useRef(null)

  const deployedAddress = useMemo(() => getDeployedAddress(), [])

  const loadEvents = async (activeContract, web3Instance) => {
    if (!activeContract || !web3Instance) {
      return
    }

    try {
      const latestBlock = await web3Instance.eth.getBlockNumber()
      const fromBlock = Math.max(0, Number(latestBlock) - 2000)
      const pastEvents = await activeContract.getPastEvents('allEvents', {
        fromBlock,
        toBlock: 'latest',
      })

      const formatted = pastEvents
        .map((event) => {
          const id = `${event.transactionHash}-${event.logIndex}`
          const summary = (() => {
            switch (event.event) {
              case 'PollTitleSet':
                return `Poll title set: ${event.returnValues.title}`
              case 'ChoicesSet':
                return `Choices updated (${event.returnValues.count})`
              case 'WhitelistSet':
                return `Whitelist updated (${event.returnValues.count})`
              case 'WhitelistAdded':
                return `Whitelisted ${formatAddress(event.returnValues.voter)}`
              case 'WhitelistRemoved':
                return `Whitelist removed ${formatAddress(event.returnValues.voter)}`
              case 'ElectionStarted':
                return 'Election started'
              case 'ElectionEnded':
                return 'Election ended'
              case 'VoteCast':
                return `Vote cast: ${formatAddress(event.returnValues.voter)} -> choice #${event.returnValues.choiceIndex}`
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
      setEventWarning('')
    } catch (eventError) {
      setEvents([])
      setEventWarning(eventError?.message || 'Failed to load events.')
    }
  }

  const loadContractState = async (activeContract, activeAccount) => {
    const [
      contractOwner,
      title,
      activeFlag,
      startTime,
      endTime,
      choiceCount,
      whitelistCount,
    ] = await Promise.all([
      activeContract.methods.owner().call(),
      activeContract.methods.pollTitle().call(),
      activeContract.methods.electionActive().call(),
      activeContract.methods.electionStart().call(),
      activeContract.methods.electionEnd().call(),
      activeContract.methods.choiceCount().call(),
      activeContract.methods.whitelistCount().call(),
    ])

    const totalChoices = toNumberSafe(choiceCount) ?? 0
    const totalWhitelist = toNumberSafe(whitelistCount) ?? 0
    const loadedChoices = []
    const loadedWhitelist = []

    for (let i = 0; i < totalChoices; i += 1) {
      const choiceInfo = await activeContract.methods.choiceInfo(i).call()
      loadedChoices.push({
        index: i,
        label: choiceInfo.label,
        votes: toNumberSafe(choiceInfo.votes) ?? 0,
      })
    }

    for (let i = 0; i < totalWhitelist; i += 1) {
      const entry = await activeContract.methods.whitelistEntry(i).call()
      loadedWhitelist.push({
        address: entry.voter,
        active: entry.active,
      })
    }

    const statusInfo = activeAccount
      ? await activeContract.methods.voterStatus(activeAccount).call()
      : [false, false, 0, 0]

    const winnerInfo = await activeContract.methods.getWinner().call()

    setOwner(contractOwner)
    setPollTitle(title)
    setElectionActive(Boolean(activeFlag))
    setElectionStart(toNumberSafe(startTime) || null)
    setElectionEnd(toNumberSafe(endTime) || null)
    setChoices(loadedChoices)
    setWhitelist(loadedWhitelist)
    setIsWhitelisted(Boolean(statusInfo[0]))
    setHasVoted(Boolean(statusInfo[1]))
    setVotedChoiceIndex(toNumberSafe(statusInfo[2]))
    setVotedAt(toNumberSafe(statusInfo[3]))
    setWinner({
      index: toNumberSafe(winnerInfo[0]) ?? 0,
      label: winnerInfo[1],
      votes: toNumberSafe(winnerInfo[2]) ?? 0,
      hasTie: Boolean(winnerInfo[3]),
      hasWinner: Boolean(winnerInfo[4]),
    })

    if (loadedChoices.length > 0 && selectedChoiceIndex === '') {
      setSelectedChoiceIndex(String(loadedChoices[0].index))
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
      if (!deployedAddress) {
        setError('No deployed contract address found for this network.')
        return
      }
      const contractInstance = new instance.eth.Contract(
        VotingArtifact.abi,
        deployedAddress,
      )

      setWeb3(instance)
      setAccount(activeAccount || '')
      setNetworkId(activeNetworkId)
      setContract(contractInstance)
      contractRef.current = contractInstance

      if (activeAccount) {
        await loadContractState(contractInstance, activeAccount)
      }
      await loadEvents(contractInstance, instance)
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
      if (contractRef.current) {
        await loadContractState(contractRef.current, nextAccount)
      }
    }

    const handleChainChanged = () => initWeb3(false)

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }, [deployedAddress])

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
    await loadEvents(contract, web3)
  }

  const handleSetPollTitle = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    if (!pollTitleInput.trim()) {
      setError('Enter a poll title.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Updating poll title...')

    try {
      await contract.methods
        .setPollTitle(pollTitleInput.trim())
        .send({ from: account })
      setPollTitleInput('')
      setStatus('Poll title updated.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Set title failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleSetChoices = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    const labels = choicesInput
      .split(/\n|,|;/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (labels.length === 0) {
      setError('Enter at least one choice.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Updating choices...')

    try {
      await contract.methods.setChoices(labels).send({ from: account })
      setChoicesInput('')
      setStatus('Choices updated.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Set choices failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleSetWhitelist = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    const addresses = whitelistInput
      .split(/\n|,|;/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (addresses.length === 0) {
      setError('Enter at least one address.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Updating whitelist...')

    try {
      await contract.methods.setWhitelist(addresses).send({ from: account })
      setWhitelistInput('')
      setStatus('Whitelist updated.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Set whitelist failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveWhitelist = async (event) => {
    event.preventDefault()
    if (!contract || !account) {
      setError('Connect your wallet first.')
      return
    }

    if (!removeWhitelistAddress) {
      setError('Select an address to remove.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Removing whitelist address...')

    try {
      await contract.methods
        .removeFromWhitelist(removeWhitelistAddress)
        .send({ from: account })
      setRemoveWhitelistAddress('')
      setStatus('Whitelist address removed.')
      await refresh()
    } catch (txError) {
      setError(txError?.message || 'Remove whitelist failed.')
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

    if (selectedChoiceIndex === '') {
      setError('Pick a choice before voting.')
      return
    }

    setBusy(true)
    setError('')
    setStatus('Submitting your vote...')

    try {
      await contract.methods
        .vote(toNumberSafe(selectedChoiceIndex))
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

  const activeWhitelist = whitelist.filter((entry) => entry.active)
  const votedChoiceLabel =
    hasVoted && votedChoiceIndex !== null && votedChoiceIndex !== undefined
      ? choices.find((choice) => choice.index === votedChoiceIndex)?.label ||
        `#${votedChoiceIndex}`
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
        <form onSubmit={handleSetPollTitle} className="d-grid gap-2">
          <label className="form-label">Poll Title</label>
          <input
            className="form-control"
            placeholder="e.g. Favorite snack"
            value={pollTitleInput}
            onChange={(event) => setPollTitleInput(event.target.value)}
            disabled={!isOwner || electionActive}
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !isOwner || electionActive}>
            Set Title
          </button>
        </form>

        <form onSubmit={handleSetChoices} className="d-grid gap-2">
          <label className="form-label">Choices</label>
          <textarea
            className="form-control"
            rows="4"
            placeholder="One choice per line"
            value={choicesInput}
            onChange={(event) => setChoicesInput(event.target.value)}
            disabled={!isOwner || electionActive}
          />
          <button className="btn btn-outline-dark" type="submit" disabled={busy || !isOwner || electionActive}>
            Set Choices
          </button>
        </form>

        <form onSubmit={handleSetWhitelist} className="d-grid gap-2">
          <label className="form-label">Whitelisted Addresses</label>
          <textarea
            className="form-control"
            rows="4"
            placeholder="One address per line"
            value={whitelistInput}
            onChange={(event) => setWhitelistInput(event.target.value)}
            disabled={!isOwner || electionActive}
          />
          <button className="btn btn-outline-dark" type="submit" disabled={busy || !isOwner || electionActive}>
            Set Whitelist
          </button>
        </form>

        <form onSubmit={handleRemoveWhitelist} className="d-grid gap-2">
          <label className="form-label">Remove Whitelisted Address</label>
          <select
            className="form-select"
            value={removeWhitelistAddress}
            onChange={(event) => setRemoveWhitelistAddress(event.target.value)}
            disabled={!isOwner || electionActive}
          >
            <option value="">Select address</option>
            {activeWhitelist.map((entry) => (
              <option key={`remove-${entry.address}`} value={entry.address}>
                {entry.address}
              </option>
            ))}
          </select>
          <button className="btn btn-outline-danger" type="submit" disabled={busy || !isOwner || electionActive}>
            Remove Address
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
          <label className="form-label">Choice</label>
          <select
            className="form-select"
            value={selectedChoiceIndex}
            onChange={(event) => setSelectedChoiceIndex(event.target.value)}
            disabled={choices.length === 0}
          >
            {choices.map((choice) => (
              <option key={`choice-${choice.index}`} value={choice.index}>
                {choice.label}
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
            choices.length === 0
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
            Your wallet is not whitelisted.
          </div>
        )}
        {hasVoted && votedAt && (
          <div className="text-muted small">
            Voted at {new Date(votedAt * 1000).toLocaleString()}.
          </div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="section-title">Whitelisted Addresses</h3>
        <div className="table-responsive">
          <table className="table table-striped align-middle">
            <thead>
              <tr>
                <th>Address</th>
                <th>Status</th>
                <th className="text-end">Whitelisted</th>
              </tr>
            </thead>
            <tbody>
              {whitelist.map((entry) => (
                <tr key={`whitelist-row-${entry.address}`}>
                  <td>{entry.address}</td>
                  <td>
                    {entry.active ? (
                      <span className="badge-pill badge-success">Active</span>
                    ) : (
                      <span className="badge-pill badge-muted">Removed</span>
                    )}
                  </td>
                  <td className="text-end">
                    {entry.active ? 'Yes' : 'No'}
                  </td>
                </tr>
              ))}
              {whitelist.length === 0 && (
                <tr>
                  <td colSpan="3" className="text-center text-muted">
                    No addresses whitelisted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )

  const resultsPage = (
    <div className="results-stack">
      <section className="card-panel">
        <h2 className="section-title">Results</h2>
          {winner?.hasWinner && (
          <div className="winner-banner">
            <div>
                <div className="winner-label">Leading Choice</div>
                <div className="winner-name">{winner.label}</div>
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
                <th>Choice</th>
                <th className="text-end">Votes</th>
              </tr>
            </thead>
            <tbody>
                {choices.map((choice) => (
                  <tr key={`result-${choice.index}`}>
                    <td>{choice.label}</td>
                    <td className="text-end">{choice.votes}</td>
                  </tr>
                ))}
                {choices.length === 0 && (
                <tr>
                    <td colSpan="2" className="text-center text-muted">
                      No choices loaded.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-panel">
        <h2 className="section-title">Activity Log</h2>
        {eventWarning && (
          <div className="alert alert-warning mb-3">{eventWarning}</div>
        )}
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
            {pollTitle
              ? `Poll: ${pollTitle}`
              : 'Full election console: admin controls, live results, and activity feed.'}
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
                  Voted for {votedChoiceLabel}
                </span>
              )}
                {votedAt && !hasVoted && (
                  <span className="stat-helper">Vote resets next election.</span>
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