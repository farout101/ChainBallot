// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Voting {
    address public owner;
    bool public electionActive;
    uint256 public electionStart;
    uint256 public electionEnd;
    string public pollTitle;
    uint256 public electionId;

    struct Choice {
        string label;
        uint256 votes;
    }

    Choice[] private choices;
    address[] private whitelistAddresses;
    mapping(address => bool) public isWhitelisted;
    mapping(address => uint256) public lastVotedElection;
    mapping(address => uint256) public lastVotedChoice;
    mapping(address => uint256) public lastVotedAt;

    event PollTitleSet(string title);
    event ChoicesSet(uint256 count);
    event WhitelistSet(uint256 count);
    event WhitelistAdded(address indexed voter);
    event WhitelistRemoved(address indexed voter);
    event ElectionStarted(uint256 startTime);
    event ElectionEnded(uint256 endTime);
    event VoteCast(address indexed voter, uint256 indexed choiceIndex);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyWhileActive() {
        require(electionActive, "Election not active");
        _;
    }

    modifier onlyWhenInactive() {
        require(!electionActive, "Election active");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setPollTitle(string calldata title) external onlyOwner onlyWhenInactive {
        pollTitle = title;
        emit PollTitleSet(title);
    }

    function setChoices(string[] calldata labels) external onlyOwner onlyWhenInactive {
        require(labels.length > 0, "No choices");
        delete choices;
        for (uint256 i = 0; i < labels.length; i++) {
            require(bytes(labels[i]).length > 0, "Empty choice");
            choices.push(Choice({label: labels[i], votes: 0}));
        }
        emit ChoicesSet(labels.length);
    }

    function setWhitelist(address[] calldata voters) external onlyOwner onlyWhenInactive {
        require(voters.length > 0, "No voters");
        _clearWhitelist();
        for (uint256 i = 0; i < voters.length; i++) {
            address voter = voters[i];
            require(voter != address(0), "Invalid voter");
            if (!isWhitelisted[voter]) {
                isWhitelisted[voter] = true;
                whitelistAddresses.push(voter);
            }
        }
        emit WhitelistSet(voters.length);
    }

    function addToWhitelist(address voter) external onlyOwner onlyWhenInactive {
        require(voter != address(0), "Invalid voter");
        if (!isWhitelisted[voter]) {
            isWhitelisted[voter] = true;
            whitelistAddresses.push(voter);
            emit WhitelistAdded(voter);
        }
    }

    function removeFromWhitelist(address voter) external onlyOwner onlyWhenInactive {
        require(isWhitelisted[voter], "Not whitelisted");
        isWhitelisted[voter] = false;
        emit WhitelistRemoved(voter);
    }

    function startElection() external onlyOwner {
        require(!electionActive, "Election already active");
        require(choices.length > 0, "No choices");
        require(_activeWhitelistCount() > 0, "No voters");
        _resetVotes();
        electionId += 1;
        electionActive = true;
        electionStart = block.timestamp;
        electionEnd = 0;
        emit ElectionStarted(electionStart);
    }

    function endElection() external onlyOwner {
        require(electionActive, "Election already ended");
        electionActive = false;
        electionEnd = block.timestamp;
        emit ElectionEnded(electionEnd);
    }

    function vote(uint256 choiceIndex) external onlyWhileActive {
        require(choiceIndex < choices.length, "Invalid choice");
        require(isWhitelisted[msg.sender], "Not whitelisted");
        require(lastVotedElection[msg.sender] < electionId, "Already voted");

        lastVotedElection[msg.sender] = electionId;
        lastVotedChoice[msg.sender] = choiceIndex;
        lastVotedAt[msg.sender] = block.timestamp;
        choices[choiceIndex].votes += 1;

        emit VoteCast(msg.sender, choiceIndex);
    }

    function choiceCount() external view returns (uint256) {
        return choices.length;
    }

    function choiceInfo(uint256 choiceIndex)
        external
        view
        returns (string memory label, uint256 votes)
    {
        require(choiceIndex < choices.length, "Invalid choice");
        Choice memory choice = choices[choiceIndex];
        return (choice.label, choice.votes);
    }

    function whitelistCount() external view returns (uint256) {
        return whitelistAddresses.length;
    }

    function whitelistEntry(uint256 index) external view returns (address voter, bool active) {
        require(index < whitelistAddresses.length, "Invalid voter");
        address addr = whitelistAddresses[index];
        return (addr, isWhitelisted[addr]);
    }

    function voterStatus(address voter)
        external
        view
        returns (bool whitelisted, bool voted, uint256 choiceIndex, uint256 votedAt)
    {
        bool votedThisElection = lastVotedElection[voter] == electionId;
        return (
            isWhitelisted[voter],
            votedThisElection,
            votedThisElection ? lastVotedChoice[voter] : 0,
            votedThisElection ? lastVotedAt[voter] : 0
        );
    }

    function getWinner()
        external
        view
        returns (uint256 winnerIndex, string memory label, uint256 votes, bool hasTie, bool hasWinner)
    {
        uint256 topVotes = 0;
        uint256 topIndex = 0;
        bool tie = false;
        bool found = false;

        for (uint256 i = 0; i < choices.length; i++) {
            Choice memory choice = choices[i];
            if (!found || choice.votes > topVotes) {
                topVotes = choice.votes;
                topIndex = i;
                tie = false;
                found = true;
            } else if (choice.votes == topVotes) {
                tie = true;
            }
        }

        if (!found) {
            return (0, "", 0, false, false);
        }

        return (topIndex, choices[topIndex].label, topVotes, tie, true);
    }

    function _resetVotes() internal {
        for (uint256 i = 0; i < choices.length; i++) {
            choices[i].votes = 0;
        }
    }

    function _clearWhitelist() internal {
        for (uint256 i = 0; i < whitelistAddresses.length; i++) {
            address addr = whitelistAddresses[i];
            if (isWhitelisted[addr]) {
                isWhitelisted[addr] = false;
            }
        }
        delete whitelistAddresses;
    }

    function _activeWhitelistCount() internal view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < whitelistAddresses.length; i++) {
            if (isWhitelisted[whitelistAddresses[i]]) {
                count += 1;
            }
        }
        return count;
    }
}
