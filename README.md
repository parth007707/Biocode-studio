# BioCode Studio

**An AI-powered platform for computational biology and bioinformatics.**

BioCode Studio is a computational biology workspace designed to help users explore biological sequences, perform bioinformatics analyses, investigate mutations, and visualize molecular structures through an integrated interface.

## Features

- **Sequence Explorer:** Retrieve and explore biological sequence data.
- **Sequence Analysis:** Perform sequence-related analysis and generate reports.
- **Mutation Analysis:** Explore sequence modifications and compare original and modified sequences.
- **3D Structure Explorer:** Visualize supported molecular structures using available structural data.
- **Biological Data Integration:** Work with biological databases and external bioinformatics resources.
- **AI Assistance:** Get AI-supported explanations and insights for biological data.
- **Project Workspace:** Organize projects, sequences, and analysis history.
- **Report Export:** Generate reports for analysis results.

## Technology Stack

The project uses technologies and integrations including:

- React and TypeScript
- Vite
- Tailwind CSS
- Supabase
- Bioinformatics data resources and APIs
- 3D molecular visualization libraries
- AI integration

*Refer to the project configuration for the exact dependency versions and enabled integrations.*

## Getting Started

### Prerequisites

- Node.js
- npm or Bun
- Access to the required backend services and API credentials

### Installation

Clone the repository:

```bash
git clone https://github.com/parth007707/Biocode-studio.git
cd Biocode-studio
```

Install dependencies:

```bash
npm install
```

Configure environment variables using `.env.example`. Add your own credentials locally. Never commit private API keys or secrets.

Start the development server:

```bash
npm run dev
```

Check `package.json` for the exact available scripts.

## Scientific Data and Structure Accuracy

BioCode Studio aims to distinguish between experimental structures, predicted structures, modelled structures, and cases where structural data is unavailable.

Structure availability depends on the biological molecule, sequence, database coverage, and supported prediction methods. A sequence should not be presented as having an experimentally verified 3D structure unless the corresponding structural evidence is available.

## Project Status

The project has completed its reported functional testing phase, with all 9 test categories reported as passed by the developer.

Further production deployment and security verification should be completed before public release.

## Repository

GitHub: https://github.com/parth007707/Biocode-studio

## Author

**Parth Atrishi**

BioCode Studio — Computational Biology Meets AI.
