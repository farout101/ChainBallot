// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Voting {
    address public owner;
    bool public electionActive;
    uint256 public electionStart;
    uint256 public electionEnd;
    string public pollTitle;

    struct Choice {
        string label;
        uint256 votes;
    }

    struct Voter {
        string name;
        bool voted;
        uint256 choiceIndex;
        uint256 votedAt;
    }

    Choice[] private choices;
    Voter[] private voters;

    event PollTitleSet(string title);
    event ChoicesSet(uint256 count);
    event VotersSet(uint256 count);
    event ElectionStarted(uint256 startTime);
    event ElectionEnded(uint256 endTime);
    event VoteCast(uint256 indexed voterIndex, uint256 indexed choiceIndex);

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

    function setVoters(string[] calldata names) external onlyOwner onlyWhenInactive {
        require(names.length > 0, "No voters");
        delete voters;
        for (uint256 i = 0; i < names.length; i++) {
            require(bytes(names[i]).length > 0, "Empty voter");
            voters.push(Voter({name: names[i], voted: false, choiceIndex: 0, votedAt: 0}));
        }
        _resetVotes();
        emit VotersSet(names.length);
    }

    function startElection() external onlyOwner {
        require(!electionActive, "Election already active");
        require(choices.length > 0, "No choices");
        require(voters.length > 0, "No voters");
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

    function vote(uint256 voterIndex, uint256 choiceIndex) external onlyWhileActive {
        require(voterIndex < voters.length, "Invalid voter");
        require(choiceIndex < choices.length, "Invalid choice");
        Voter storage voter = voters[voterIndex];
        require(!voter.voted, "Already voted");

        voter.voted = true;
        voter.choiceIndex = choiceIndex;
        voter.votedAt = block.timestamp;
        choices[choiceIndex].votes += 1;

        emit VoteCast(voterIndex, choiceIndex);
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

    function voterCount() external view returns (uint256) {
        return voters.length;
    }

    function voterInfo(uint256 voterIndex)
        external
        view
        returns (string memory name, bool voted, uint256 choiceIndex, uint256 votedAt)
    {
        require(voterIndex < voters.length, "Invalid voter");
        Voter memory voter = voters[voterIndex];
        return (voter.name, voter.voted, voter.choiceIndex, voter.votedAt);
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
}
