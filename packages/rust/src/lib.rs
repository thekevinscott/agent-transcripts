use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser, Debug)]
#[command(
    name = "agent-transcripts",
    version,
    about = "Capture coding-agent transcripts to disk and expose them as SQL.",
    long_about = None,
)]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Detect installed harnesses and register transcript hooks for each.
    Install(InstallArgs),
    /// Run the ingest service: receive transcript bytes, write the tree.
    Ingest(IngestArgs),
    /// Run the exposing service: serve SQL over the tree.
    Serve(ServeArgs),
}

/// A coding agent whose transcripts this tool knows how to capture.
///
/// Each variant is a distinct hook mechanism and config location, not just a
/// label — adding one is real work, so the list is exactly what is supported.
#[derive(Copy, Clone, Debug, PartialEq, Eq, ValueEnum)]
pub enum Harness {
    /// Claude Code — `Stop` / `SubagentStop` hooks in a settings.json.
    ClaudeCode,
    /// pi.
    Pi,
}

impl Harness {
    /// The on-disk name for this harness, used as the `{harness}` path
    /// segment in the transcript tree.
    pub fn slug(self) -> &'static str {
        match self {
            Harness::ClaudeCode => "claude-code",
            Harness::Pi => "pi",
        }
    }
}

#[derive(Parser, Debug)]
pub struct InstallArgs {
    /// Which harness to install hooks for.
    pub harness: Harness,

    /// Base URL of the ingest service the installed hooks will post to.
    #[arg(long)]
    pub url: Option<String>,

    /// Report what would be written without touching anything.
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Parser, Debug)]
pub struct IngestArgs {
    /// Root of the transcript tree to write into.
    #[arg(long, default_value = "./data")]
    pub data_dir: String,

    /// Address to listen on.
    #[arg(long, default_value = "127.0.0.1:8150")]
    pub listen: String,
}

#[derive(Parser, Debug)]
pub struct ServeArgs {
    /// Root of the transcript tree to index.
    #[arg(long, default_value = "./data")]
    pub data_dir: String,

    /// Address to listen on.
    #[arg(long, default_value = "127.0.0.1:8151")]
    pub listen: String,
}

pub fn run<I, T>(args: I) -> anyhow::Result<i32>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let cli = Cli::try_parse_from(args)?;
    match cli.command {
        Command::Install(a) => {
            anyhow::bail!(
                "install is not implemented yet (harness: {})",
                a.harness.slug()
            )
        }
        Command::Ingest(_) => anyhow::bail!("ingest is not implemented yet"),
        Command::Serve(_) => anyhow::bail!("serve is not implemented yet"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Cli {
        Cli::try_parse_from(args).expect("should parse")
    }

    #[test]
    fn no_subcommand_errors() {
        assert!(run(["agent-transcripts"]).is_err());
    }

    #[test]
    fn unknown_flag_errors() {
        assert!(run(["agent-transcripts", "--bogus"]).is_err());
    }

    #[test]
    fn help_flag_returns_clap_display_help() {
        let err = run(["agent-transcripts", "--help"]).expect_err("--help should bubble");
        let clap_err = err
            .downcast_ref::<clap::Error>()
            .expect("error should be a clap::Error");
        assert_eq!(clap_err.kind(), clap::error::ErrorKind::DisplayHelp);
    }

    #[test]
    fn version_flag_returns_clap_display_version() {
        let err = run(["agent-transcripts", "--version"]).expect_err("--version should bubble");
        let clap_err = err
            .downcast_ref::<clap::Error>()
            .expect("error should be a clap::Error");
        assert_eq!(clap_err.kind(), clap::error::ErrorKind::DisplayVersion);
    }

    fn install_of(args: &[&str]) -> InstallArgs {
        match parse(args).command {
            Command::Install(a) => a,
            other => panic!("expected install, got {other:?}"),
        }
    }

    #[test]
    fn install_takes_harness_positionally() {
        let a = install_of(&[
            "agent-transcripts",
            "install",
            "claude-code",
            "--url",
            "http://example.invalid:8150",
        ]);
        assert_eq!(a.harness, Harness::ClaudeCode);
        assert_eq!(a.url.as_deref(), Some("http://example.invalid:8150"));
        assert!(!a.dry_run);
    }

    #[test]
    fn install_supports_both_harnesses_today() {
        assert_eq!(
            install_of(&["agent-transcripts", "install", "claude-code"]).harness,
            Harness::ClaudeCode
        );
        assert_eq!(
            install_of(&["agent-transcripts", "install", "pi"]).harness,
            Harness::Pi
        );
    }

    #[test]
    fn install_requires_a_harness() {
        assert!(run(["agent-transcripts", "install"]).is_err());
    }

    #[test]
    fn install_rejects_an_unknown_harness() {
        assert!(run(["agent-transcripts", "install", "emacs"]).is_err());
    }

    #[test]
    fn harness_slugs_match_the_tree_path_segment() {
        assert_eq!(Harness::ClaudeCode.slug(), "claude-code");
        assert_eq!(Harness::Pi.slug(), "pi");
    }

    #[test]
    fn install_dry_run_defaults_off_and_sets() {
        assert!(!install_of(&["agent-transcripts", "install", "pi"]).dry_run);
        assert!(install_of(&["agent-transcripts", "install", "pi", "--dry-run"]).dry_run);
    }

    #[test]
    fn ingest_has_data_dir_and_listen_defaults() {
        match parse(&["agent-transcripts", "ingest"]).command {
            Command::Ingest(a) => {
                assert_eq!(a.data_dir, "./data");
                assert_eq!(a.listen, "127.0.0.1:8150");
            }
            other => panic!("expected ingest, got {other:?}"),
        }
    }

    #[test]
    fn serve_listens_on_a_different_default_port_than_ingest() {
        let ingest = match parse(&["agent-transcripts", "ingest"]).command {
            Command::Ingest(a) => a.listen,
            other => panic!("expected ingest, got {other:?}"),
        };
        let serve = match parse(&["agent-transcripts", "serve"]).command {
            Command::Serve(a) => a.listen,
            other => panic!("expected serve, got {other:?}"),
        };
        assert_ne!(ingest, serve);
    }

    #[test]
    fn serve_data_dir_is_overridable() {
        match parse(&["agent-transcripts", "serve", "--data-dir", "/srv/tree"]).command {
            Command::Serve(a) => assert_eq!(a.data_dir, "/srv/tree"),
            other => panic!("expected serve, got {other:?}"),
        }
    }

    #[test]
    fn subcommands_parse_but_are_not_implemented_yet() {
        let cases: [&[&str]; 3] = [
            &["agent-transcripts", "install", "claude-code"],
            &["agent-transcripts", "ingest"],
            &["agent-transcripts", "serve"],
        ];
        for args in cases {
            let err = run(args.iter().copied()).expect_err("stub should error");
            assert!(
                err.to_string().contains("not implemented"),
                "{args:?}: unexpected error {err}"
            );
        }
    }

    #[test]
    fn install_stub_names_the_harness_it_would_have_used() {
        let err = run(["agent-transcripts", "install", "pi"]).expect_err("stub should error");
        assert!(err.to_string().contains("pi"), "unexpected error {err}");
    }
}
